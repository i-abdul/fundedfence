import { freshBrokerResetSeconds } from "@/lib/domain/daily-risk";
import { ECONOMIC_CALENDAR_PROVIDER, mapCanonicalFxSymbol } from "@/lib/domain/economic-calendar";
import { calculateBrokerSessions, validateBrokerSessions } from "@/lib/domain/broker-sessions";
import { validateRuleDefinition, type RuleDefinition } from "@/lib/domain/rule-profile";
import type { AppDatabase } from "./database";

type Freshness = "live" | "delayed" | "offline";

export async function buildCommandCentre(database: AppDatabase, input: {
  accountId: string;
  ruleVersionId: string | null;
  resetKey: string | null;
  freshness: Freshness;
  snapshot: { observedAt: string; equityMinor: string; serverTime: string; symbolSessions?: unknown } | null;
  dealHistoryComplete: boolean;
}): Promise<Record<string, unknown>> {
  const generatedAtMs = Date.now();
  const generatedAt = new Date(generatedAtMs).toISOString();
  const rule = input.ruleVersionId ? await effectiveRule(database, input.ruleVersionId) : null;
  const riskState = input.resetKey ? await database.prepare("SELECT start_of_day_equity_minor FROM account_risk_states WHERE trading_account_id = ? AND reset_key = ? LIMIT 1")
    .bind(input.accountId, input.resetKey).first<{ start_of_day_equity_minor: string }>() : null;
  const alerts = await database.prepare("SELECT id, alert_type, severity, title, updated_at FROM alerts WHERE trading_account_id = ? AND resolved_at IS NULL AND dismissed_at IS NULL ORDER BY updated_at DESC LIMIT 20")
    .bind(input.accountId).all<{ id: string; alert_type: string; severity: string; title: string; updated_at: string }>();
  const alertCount = await database.prepare("SELECT COUNT(*) AS active_count FROM alerts WHERE trading_account_id = ? AND resolved_at IS NULL AND dismissed_at IS NULL")
    .bind(input.accountId).first<{ active_count: number | string }>();
  const news = await marketNews(database, input.accountId, generatedAt, rule).catch(() => unavailableNews(rule));
  const resetSeconds = input.freshness === "live" && input.snapshot ? freshBrokerResetSeconds(input.snapshot.serverTime, input.snapshot.observedAt, generatedAtMs) : null;
  return {
    generatedAt,
    news,
    sessions: marketSessions(input.snapshot, input.freshness, generatedAtMs),
    tradingDay: {
      availability: resetSeconds === null ? "unknown" : "calculated",
      reason: resetSeconds === null ? "A fresh broker-server snapshot is required for the reset countdown." : "Countdown uses the latest fresh broker-server clock.",
      resetKey: input.resetKey,
      resetRemainingSeconds: resetSeconds,
      equityChangeMinor: input.snapshot && riskState ? (BigInt(input.snapshot.equityMinor) - BigInt(riskState.start_of_day_equity_minor)).toString() : null,
      entryCount: null,
      historyComplete: input.dealHistoryComplete,
    },
    notifications: {
      activeCount: Number(alertCount?.active_count ?? 0),
      latest: alerts.results.slice(0, 3).map((alert) => ({ id: alert.id, type: alert.alert_type, severity: alert.severity, title: alert.title, detectedAt: alert.updated_at })),
      email: "not-configured",
    },
    sessionAnalytics: {
      availability: "unknown",
      reason: "No authoritative named session definitions are stored.",
      rows: [],
    },
  };
}

function marketSessions(snapshot: { observedAt: string; serverTime: string; symbolSessions?: unknown } | null, freshness: Freshness, generatedAtMs: number): Record<string, unknown> {
  if (!snapshot || freshness !== "live" || snapshot.symbolSessions === undefined) return { availability: "unknown", reason: "A fresh snapshot from connector 0.5 or newer is required for broker sessions.", symbols: [], nextTransition: null };
  try {
    const sessions = validateBrokerSessions(snapshot.symbolSessions);
    if (!sessions.length) return { availability: "calculated", reason: "No open positions or pending orders require a broker-session timer.", symbols: [], nextTransition: null };
    const state = calculateBrokerSessions(sessions, snapshot.serverTime, snapshot.observedAt, generatedAtMs);
    return state
      ? { availability: "calculated", reason: "Times come from authoritative MT5 symbol trading sessions and the fresh broker clock.", ...state }
      : { availability: "unknown", reason: "A fresh broker snapshot is required for session timing.", symbols: [], nextTransition: null };
  } catch {
    return { availability: "unknown", reason: "The broker session payload could not be validated.", symbols: [], nextTransition: null };
  }
}

async function marketNews(database: AppDatabase, accountId: string, generatedAt: string, rule: RuleDefinition | null): Promise<Record<string, unknown>> {
  const sync = await database.prepare("SELECT status, fetched_at, covered_through, error FROM calendar_sync_states WHERE provider = ? LIMIT 1")
    .bind(ECONOMIC_CALENDAR_PROVIDER).first<{ status: string; fetched_at: string | null; covered_through: string | null; error: string | null }>();
  const fetchedAge = sync?.fetched_at ? Date.parse(generatedAt) - Date.parse(sync.fetched_at) : Number.POSITIVE_INFINITY;
  if (!sync || sync.status !== "healthy" || !sync.fetched_at || !sync.covered_through || sync.covered_through < generatedAt || fetchedAge < 0 || fetchedAge > 30 * 60_000) return unavailableNews(rule, sync?.covered_through ?? null);

  const symbolRows = await database.prepare("SELECT symbol FROM positions WHERE trading_account_id = ? AND closed_at IS NULL UNION SELECT symbol FROM pending_orders WHERE trading_account_id = ? AND closed_at IS NULL")
    .bind(accountId, accountId).all<{ symbol: string }>();
  const mappings = symbolRows.results.map((row) => mapCanonicalFxSymbol(row.symbol));
  const currencies = [...new Set(mappings.flatMap((mapping) => mapping.currencies))];
  if (!currencies.length) return { availability: "calculated", reason: mappings.length ? "Open symbols cannot be mapped without guessing." : "No open positions or pending orders require event matching.", coveredThrough: sync.covered_through, treatment: rule ? newsTreatment(rule) : null, mappings, nextEvent: null };

  const placeholders = currencies.map(() => "?").join(",");
  const events = await database.prepare(`SELECT id, title, currency, impact, scheduled_at, forecast, previous, revision_hash FROM economic_events WHERE provider = ? AND fetched_at = ? AND impact = 'high' AND scheduled_at >= ? AND scheduled_at <= ? AND currency IN (${placeholders}) ORDER BY scheduled_at ASC LIMIT 50`)
    .bind(ECONOMIC_CALENDAR_PROVIDER, sync.fetched_at, generatedAt, sync.covered_through, ...currencies).all<{ id: string; title: string; currency: string; impact: string; scheduled_at: string; forecast: string | null; previous: string | null; revision_hash: string }>();
  const event = events.results[0];
  if (!event) return { availability: "calculated", reason: "No mapped event is present in the currently covered feed window.", coveredThrough: sync.covered_through, treatment: rule ? newsTreatment(rule) : null, mappings, nextEvent: null };
  const affectedSymbols = mappings.filter((mapping) => mapping.currencies.includes(event.currency)).map((mapping) => mapping.symbol);
  const treatment = rule ? newsTreatment(rule) : null;
  return {
    availability: "calculated",
    reason: "Provider high-impact classification is informational; FundedNext event qualification remains unverified.",
    coveredThrough: sync.covered_through,
    treatment,
    mappings,
    nextEvent: {
      id: event.id,
      title: event.title,
      currency: event.currency,
      impact: event.impact,
      scheduledAt: event.scheduled_at,
      remainingSeconds: Math.max(0, Math.floor((Date.parse(event.scheduled_at) - Date.parse(generatedAt)) / 1000)),
      forecast: event.forecast,
      previous: event.previous,
      affectedSymbols,
      qualification: "unverified",
      windowStartsAt: null,
      windowEndsAt: null,
      source: { provider: ECONOMIC_CALENDAR_PROVIDER, authorityClass: "unverified-calendar", revisionHash: event.revision_hash },
    },
  };
}

function unavailableNews(rule: RuleDefinition | null, coveredThrough: string | null = null): Record<string, unknown> {
  return { availability: "unknown", reason: "The unverified calendar feed is unavailable, stale, or no longer covers the current time.", coveredThrough, treatment: rule ? newsTreatment(rule) : null, mappings: [], nextEvent: null };
}

async function effectiveRule(database: AppDatabase, ruleVersionId: string): Promise<RuleDefinition | null> {
  const row = await database.prepare("SELECT definition_json FROM rule_versions WHERE id = ? AND verification_status = 'effective' LIMIT 1").bind(ruleVersionId).first<{ definition_json: string }>();
  if (!row) return null;
  try { return validateRuleDefinition(JSON.parse(row.definition_json)); } catch { return null; }
}

function newsTreatment(rule: RuleDefinition): Record<string, unknown> {
  return {
    mode: rule.news.mode,
    label: rule.news.mode === "allowed" ? "Allowed" : "Allowed with reward adjustment",
    windowMinutesBefore: rule.news.windowMinutesBefore,
    windowMinutesAfter: rule.news.windowMinutesAfter,
    qualifyingProfitBps: rule.news.qualifyingProfitBps,
    affectedInstrumentsOnly: rule.news.affectedInstrumentsOnly,
  };
}
