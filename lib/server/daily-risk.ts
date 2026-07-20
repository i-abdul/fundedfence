import { brokerResetKey } from "@/lib/domain/risk-guardian";
import {
  evaluateDailyRisk,
  validateDailyRiskPlan,
  type DailyRiskPlan,
  type DailyRiskPosition,
} from "@/lib/domain/daily-risk";
import { sha256Hex, stableId } from "./crypto";
import type { AppDatabase, AppPreparedStatement } from "./database";

const ACTION_TYPES = [
  "stop.missing",
  "stop.moved-away",
  "exposure.trade-limit",
  "exposure.combined",
  "plan.trade-limit",
  "plan.loss-stop",
  "plan.profit-lock",
  "behaviour.lot-escalation",
  "behaviour.rapid-reentry",
  "behaviour.post-loss-reentry",
  "timing.reset-proximity",
] as const;

type PlanRow = {
  id: string;
  reset_key: string;
  version: number;
  risk_budget_minor: string;
  max_risk_per_trade_minor: string;
  max_trades: number;
  loss_stop_minor: string;
  profit_lock_minor: string;
  preservation_mode: DailyRiskPlan["preservationMode"];
  profit_lock_triggered_at: string | null;
  updated_at: string;
};

type AlertRow = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  evidence_json: string;
  deduplication_key: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  dismissed_at: string | null;
  resolution_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicRiskAction = {
  id: string;
  type: string;
  severity: string;
  priority: number;
  title: string;
  evidence: Record<string, unknown>;
  state: "open" | "acknowledged" | "resolved" | "dismissed";
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
  resolutionReason: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
};

export async function latestDailyPlan(database: AppDatabase, accountId: string, resetKey?: string): Promise<DailyRiskPlan | null> {
  const row = await database.prepare(`SELECT id, reset_key, version, risk_budget_minor, max_risk_per_trade_minor, max_trades, loss_stop_minor, profit_lock_minor, preservation_mode, profit_lock_triggered_at, updated_at FROM daily_risk_plans WHERE trading_account_id = ?${resetKey ? " AND reset_key = ?" : ""} ORDER BY reset_key DESC LIMIT 1`)
    .bind(...(resetKey ? [accountId, resetKey] : [accountId])).first<PlanRow>();
  return row ? publicPlan(row) : null;
}

export async function currentRiskActions(database: AppDatabase, accountId: string, includeResolved = false): Promise<PublicRiskAction[]> {
  const resetKey = includeResolved ? null : await currentResetKey(database, accountId);
  if (!includeResolved && !resetKey) return [];
  const placeholders = ACTION_TYPES.map(() => "?").join(",");
  const rows = await database.prepare(`SELECT id, alert_type, severity, title, evidence_json, deduplication_key, acknowledged_at, resolved_at, dismissed_at, resolution_reason, created_at, updated_at FROM alerts WHERE trading_account_id = ? AND alert_type IN (${placeholders})${includeResolved ? "" : " AND deduplication_key LIKE ? AND resolved_at IS NULL AND dismissed_at IS NULL"} ORDER BY updated_at DESC LIMIT 200`)
    .bind(accountId, ...ACTION_TYPES, ...(!includeResolved ? [`${accountId}:${resetKey}:%`] : [])).all<AlertRow>();
  return rows.results.map(publicAction).sort((a, b) => a.priority - b.priority || b.lastDetectedAt.localeCompare(a.lastDetectedAt) || a.id.localeCompare(b.id));
}

export async function buildDailyRiskActionStatements(database: AppDatabase, input: {
  tradingAccountId: string;
  snapshotId: string;
  observedAt: string;
  snapshot: { equityMinor: string; serverTime: string };
  positions: unknown;
  calculatedAt: string;
}): Promise<AppPreparedStatement[]> {
  if (!Array.isArray(input.positions)) return [];
  const resetKey = brokerResetKey(input.snapshot.serverTime);
  const plan = await latestDailyPlan(database, input.tradingAccountId, resetKey);
  const previousRows = await database.prepare("SELECT ticket, stop_loss_price_points FROM positions WHERE trading_account_id = ? AND closed_at IS NULL")
    .bind(input.tradingAccountId).all<{ ticket: string; stop_loss_price_points: string | null }>();
  const previousStops = new Map(previousRows.results.map((row) => [row.ticket, row.stop_loss_price_points]));
  const positions = input.positions.map((value) => asPosition(value, previousStops));
  const riskState = await database.prepare("SELECT start_of_day_equity_minor FROM account_risk_states WHERE trading_account_id = ? AND reset_key = ? LIMIT 1")
    .bind(input.tradingAccountId, resetKey).first<{ start_of_day_equity_minor: string }>();
  const baselineSnapshot = await database.prepare("SELECT equity_minor FROM account_snapshots WHERE trading_account_id = ? AND (server_time LIKE ? OR server_time LIKE ?) ORDER BY observed_at ASC LIMIT 1")
    .bind(input.tradingAccountId, `${resetKey.replaceAll("-", ".")}%`, `${resetKey}%`).first<{ equity_minor: string }>();
  // ponytail: deal backfill/continuity is not authoritative yet, so history-based checks stay unknown.
  const historyComplete = false;
  const evaluation = evaluateDailyRisk({
    resetKey,
    observedAt: input.observedAt,
    serverTime: input.snapshot.serverTime,
    snapshotId: input.snapshotId,
    equityMinor: input.snapshot.equityMinor,
    startOfDayEquityMinor: riskState?.start_of_day_equity_minor ?? baselineSnapshot?.equity_minor ?? null,
    plan,
    positions,
    deals: [],
  });
  if (!historyComplete) {
    for (const type of ["plan.trade-limit", "behaviour.lot-escalation", "behaviour.rapid-reentry", "behaviour.post-loss-reentry"]) {
      const index = evaluation.evaluatedTypes.indexOf(type);
      if (index >= 0) evaluation.evaluatedTypes.splice(index, 1);
    }
  }

  const existing = await database.prepare(`SELECT id, alert_type, severity, title, evidence_json, deduplication_key, resolved_at, dismissed_at FROM alerts WHERE trading_account_id = ? AND alert_type IN (${ACTION_TYPES.map(() => "?").join(",")})`)
    .bind(input.tradingAccountId, ...ACTION_TYPES).all<Pick<AlertRow, "id" | "alert_type" | "severity" | "title" | "evidence_json" | "deduplication_key" | "resolved_at" | "dismissed_at">>();
  const currentPositions = new Map(positions.map((position) => [position.ticket, position]));
  for (const action of existing.results) {
    if (action.alert_type !== "stop.moved-away" || action.dismissed_at || !action.deduplication_key.startsWith(`${input.tradingAccountId}:${resetKey}:`)) continue;
    const previousEvidence = parseEvidence(action.evidence_json);
    const ticket = typeof previousEvidence.ticket === "string" ? previousEvidence.ticket : "";
    const baseline = typeof previousEvidence.previousStopPricePoints === "string" ? previousEvidence.previousStopPricePoints : null;
    const currentFinding = evaluation.findings.find((finding) => `${input.tradingAccountId}:${resetKey}:${finding.actionType}:${finding.subjectKey}` === action.deduplication_key);
    if (currentFinding) {
      if (baseline !== null) currentFinding.evidence.previousStopPricePoints = baseline;
      continue;
    }
    const position = currentPositions.get(ticket);
    if (!position || baseline === null || position.stopLossPricePoints === null) continue;
    const stillMovedAway = position.direction === "buy" ? BigInt(position.stopLossPricePoints) < BigInt(baseline) : BigInt(position.stopLossPricePoints) > BigInt(baseline);
    if (stillMovedAway) evaluation.findings.push({ actionType: "stop.moved-away", subjectKey: ticket, severity: action.severity as "critical" | "high" | "medium" | "info", priority: typeof previousEvidence.priority === "number" ? previousEvidence.priority : 20, title: action.title, evidence: { ...previousEvidence, snapshotId: input.snapshotId, currentStopPricePoints: position.stopLossPricePoints } });
  }
  const statements: AppPreparedStatement[] = [];
  const activeKeys = new Set<string>();
  for (const finding of evaluation.findings) {
    const dedupe = `${input.tradingAccountId}:${resetKey}:${finding.actionType}:${finding.subjectKey}`;
    activeKeys.add(dedupe);
    const id = await stableId("alert", dedupe);
    const evidenceJson = JSON.stringify({ ...finding.evidence, priority: finding.priority });
    statements.push(database.prepare("INSERT INTO alerts (id, trading_account_id, severity, alert_type, title, evidence_json, deduplication_key, acknowledged_at, acknowledged_by_user_id, resolved_at, resolved_by_user_id, dismissed_at, dismissed_by_user_id, resolution_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?) ON CONFLICT(deduplication_key) DO UPDATE SET severity = excluded.severity, title = excluded.title, evidence_json = excluded.evidence_json, acknowledged_at = CASE WHEN alerts.resolved_at IS NOT NULL THEN NULL ELSE alerts.acknowledged_at END, acknowledged_by_user_id = CASE WHEN alerts.resolved_at IS NOT NULL THEN NULL ELSE alerts.acknowledged_by_user_id END, resolved_at = NULL, resolved_by_user_id = NULL, resolution_reason = CASE WHEN alerts.dismissed_at IS NULL THEN NULL ELSE alerts.resolution_reason END, updated_at = excluded.updated_at")
      .bind(id, input.tradingAccountId, finding.severity, finding.actionType, finding.title, evidenceJson, dedupe, input.calculatedAt, input.calculatedAt));
    if (finding.actionType === "plan.profit-lock" && plan?.profitLockTriggeredAt === null) statements.push(database.prepare("UPDATE daily_risk_plans SET profit_lock_triggered_at = ?, updated_at = ? WHERE id = ? AND profit_lock_triggered_at IS NULL").bind(input.calculatedAt, input.calculatedAt, plan.id));
  }
  const evaluated = new Set(evaluation.evaluatedTypes);
  for (const action of existing.results) {
    if (!action.deduplication_key.startsWith(`${input.tradingAccountId}:${resetKey}:`) && !action.resolved_at && !action.dismissed_at) {
      statements.push(database.prepare("UPDATE alerts SET resolved_at = ?, resolved_by_user_id = NULL, resolution_reason = 'Broker day ended.', updated_at = ? WHERE id = ? AND resolved_at IS NULL AND dismissed_at IS NULL").bind(input.calculatedAt, input.calculatedAt, action.id));
      continue;
    }
    if (!evaluated.has(action.alert_type) || activeKeys.has(action.deduplication_key) || action.resolved_at || action.dismissed_at) continue;
    statements.push(database.prepare("UPDATE alerts SET resolved_at = ?, resolved_by_user_id = NULL, resolution_reason = 'Condition cleared by current telemetry.', updated_at = ? WHERE id = ? AND resolved_at IS NULL AND dismissed_at IS NULL")
      .bind(input.calculatedAt, input.calculatedAt, action.id));
  }
  return statements;
}

export async function saveDailyPlan(database: AppDatabase, input: {
  accountId: string;
  userId: string;
  resetKey: string;
  riskBudgetMinor: string;
  maxRiskPerTradeMinor: string;
  maxTrades: number;
  lossStopMinor: string;
  profitLockMinor: string;
  preservationMode: DailyRiskPlan["preservationMode"];
}): Promise<DailyRiskPlan> {
  validateDailyRiskPlan(input);
  const nowIso = new Date().toISOString();
  const id = await stableId("plan", `${input.accountId}:${input.resetKey}`);
  await database.prepare("INSERT INTO daily_risk_plans (id, trading_account_id, reset_key, version, risk_budget_minor, max_risk_per_trade_minor, max_trades, loss_stop_minor, profit_lock_minor, preservation_mode, profit_lock_triggered_at, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?) ON CONFLICT(trading_account_id, reset_key) DO UPDATE SET version = daily_risk_plans.version + 1, risk_budget_minor = excluded.risk_budget_minor, max_risk_per_trade_minor = excluded.max_risk_per_trade_minor, max_trades = excluded.max_trades, loss_stop_minor = excluded.loss_stop_minor, profit_lock_minor = excluded.profit_lock_minor, preservation_mode = excluded.preservation_mode, profit_lock_triggered_at = CASE WHEN excluded.profit_lock_minor = daily_risk_plans.profit_lock_minor AND excluded.preservation_mode = daily_risk_plans.preservation_mode THEN daily_risk_plans.profit_lock_triggered_at ELSE NULL END, updated_at = excluded.updated_at")
    .bind(id, input.accountId, input.resetKey, input.riskBudgetMinor, input.maxRiskPerTradeMinor, input.maxTrades, input.lossStopMinor, input.profitLockMinor, input.preservationMode, input.userId, nowIso, nowIso).run();
  return (await latestDailyPlan(database, input.accountId, input.resetKey))!;
}

export async function currentResetKey(database: AppDatabase, accountId: string): Promise<string | null> {
  const state = await database.prepare("SELECT reset_key FROM account_risk_states WHERE trading_account_id = ? LIMIT 1").bind(accountId).first<{ reset_key: string }>();
  if (state) return state.reset_key;
  const snapshot = await database.prepare("SELECT server_time FROM account_snapshots WHERE trading_account_id = ? ORDER BY observed_at DESC LIMIT 1").bind(accountId).first<{ server_time: string }>();
  return snapshot ? brokerResetKey(snapshot.server_time) : null;
}

export async function dailyRiskAvailability(database: AppDatabase, accountId: string, resetKey: string | null): Promise<{ dealHistory: "calculated" | "unknown"; dealHistoryReason: string }> {
  void database;
  void accountId;
  return resetKey
    ? { dealHistory: "unknown", dealHistoryReason: "Trade-count and behavior checks require authoritative deal backfill and continuity." }
    : { dealHistory: "unknown", dealHistoryReason: "A broker-day snapshot has not been received." };
}

export async function reevaluateStoredDailyRisk(database: AppDatabase, accountId: string): Promise<void> {
  const snapshot = await database.prepare("SELECT id, observed_at, equity_minor, server_time, raw_payload_json FROM account_snapshots WHERE trading_account_id = ? ORDER BY observed_at DESC LIMIT 1")
    .bind(accountId).first<{ id: string; observed_at: string; equity_minor: string; server_time: string; raw_payload_json: string }>();
  if (!snapshot) return;
  const payload = JSON.parse(snapshot.raw_payload_json) as { positions?: unknown };
  const statements = await buildDailyRiskActionStatements(database, { tradingAccountId: accountId, snapshotId: snapshot.id, observedAt: snapshot.observed_at, snapshot: { equityMinor: snapshot.equity_minor, serverTime: snapshot.server_time }, positions: payload.positions, calculatedAt: new Date().toISOString() });
  if (statements.length) await database.batch(statements);
}

export async function transitionRiskAction(database: AppDatabase, input: { accountId: string; organizationId: string; userId: string; actionId: string; transition: "acknowledge" | "resolve" | "dismiss"; reason: string }): Promise<void> {
  const action = await database.prepare(`SELECT id, acknowledged_at, resolved_at, dismissed_at FROM alerts WHERE id = ? AND trading_account_id = ? AND alert_type IN (${ACTION_TYPES.map(() => "?").join(",")}) LIMIT 1`)
    .bind(input.actionId, input.accountId, ...ACTION_TYPES).first<{ id: string; acknowledged_at: string | null; resolved_at: string | null; dismissed_at: string | null }>();
  if (!action) throw new Error("Risk action not found.");
  if (input.transition === "dismiss" && !input.reason) throw new Error("A dismissal reason is required.");
  if (action.resolved_at || action.dismissed_at || (input.transition === "acknowledge" && action.acknowledged_at)) throw new Error("The risk action is no longer eligible for that transition.");
  const nowIso = new Date().toISOString();
  const update = input.transition === "acknowledge"
    ? database.prepare("UPDATE alerts SET acknowledged_at = ?, acknowledged_by_user_id = ?, updated_at = ? WHERE id = ? AND trading_account_id = ? AND acknowledged_at IS NULL AND resolved_at IS NULL AND dismissed_at IS NULL").bind(nowIso, input.userId, nowIso, input.actionId, input.accountId)
    : input.transition === "resolve"
      ? database.prepare("UPDATE alerts SET resolved_at = ?, resolved_by_user_id = ?, resolution_reason = ?, updated_at = ? WHERE id = ? AND trading_account_id = ? AND resolved_at IS NULL AND dismissed_at IS NULL").bind(nowIso, input.userId, input.reason || "Resolved by account owner.", nowIso, input.actionId, input.accountId)
      : database.prepare("UPDATE alerts SET dismissed_at = ?, dismissed_by_user_id = ?, resolution_reason = ?, updated_at = ? WHERE id = ? AND trading_account_id = ? AND resolved_at IS NULL AND dismissed_at IS NULL").bind(nowIso, input.userId, input.reason, nowIso, input.actionId, input.accountId);
  const payload = JSON.stringify({ actionId: input.actionId, transition: input.transition, reason: input.reason });
  const previous = await database.prepare("SELECT event_hash FROM audit_events WHERE organization_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1").bind(input.organizationId).first<{ event_hash: string }>();
  const timestampColumn = input.transition === "acknowledge" ? "acknowledged_at" : input.transition === "resolve" ? "resolved_at" : "dismissed_at";
  const audit = database.prepare(`INSERT INTO audit_events (id, organization_id, trading_account_id, actor_type, actor_id, event_type, occurred_at, correlation_id, payload_json, previous_hash, event_hash) SELECT ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM alerts WHERE id = ? AND trading_account_id = ? AND ${timestampColumn} = ?)`)
    .bind(`audit_${crypto.randomUUID().replace(/-/g, "")}`, input.organizationId, input.accountId, input.userId, `risk-action.${input.transition}`, nowIso, crypto.randomUUID(), payload, previous?.event_hash ?? null, await sha256Hex(`${previous?.event_hash ?? ""}:${payload}`), input.actionId, input.accountId, nowIso);
  await database.batch([update, audit]);
  const transitioned = await database.prepare(`SELECT ${timestampColumn} AS transitioned_at FROM alerts WHERE id = ? AND trading_account_id = ? LIMIT 1`).bind(input.actionId, input.accountId).first<{ transitioned_at: string | null }>();
  if (transitioned?.transitioned_at !== nowIso) throw new Error("The risk action changed before the transition completed.");
}

function publicPlan(row: PlanRow): DailyRiskPlan {
  return { id: row.id, resetKey: row.reset_key, version: row.version, riskBudgetMinor: row.risk_budget_minor, maxRiskPerTradeMinor: row.max_risk_per_trade_minor, maxTrades: row.max_trades, lossStopMinor: row.loss_stop_minor, profitLockMinor: row.profit_lock_minor, preservationMode: row.preservation_mode, profitLockTriggeredAt: row.profit_lock_triggered_at, updatedAt: row.updated_at };
}

function publicAction(row: AlertRow): PublicRiskAction {
  let evidence: Record<string, unknown> = {};
  try { evidence = JSON.parse(row.evidence_json) as Record<string, unknown>; } catch {}
  return { id: row.id, type: row.alert_type, severity: row.severity, priority: typeof evidence.priority === "number" ? evidence.priority : 100, title: row.title, evidence, state: row.dismissed_at ? "dismissed" : row.resolved_at ? "resolved" : row.acknowledged_at ? "acknowledged" : "open", acknowledgedAt: row.acknowledged_at, resolvedAt: row.resolved_at, dismissedAt: row.dismissed_at, resolutionReason: row.resolution_reason, firstDetectedAt: row.created_at, lastDetectedAt: row.updated_at };
}

function asPosition(value: unknown, previousStops: Map<string, string | null>): DailyRiskPosition {
  const position = value as Record<string, unknown>;
  const ticket = String(position.ticket);
  return { ticket, symbol: String(position.symbol), direction: position.direction as "buy" | "sell", volumeUnits: String(position.volumeUnits), currentPricePoints: String(position.currentPricePoints), stopLossPricePoints: position.stopLossPricePoints == null ? null : String(position.stopLossPricePoints), tickSizePoints: position.tickSizePoints == null ? null : String(position.tickSizePoints), tickValueLossMinorPerLot: position.tickValueLossMinorPerLot == null ? null : String(position.tickValueLossMinorPerLot), previousStopLossPricePoints: previousStops.has(ticket) ? previousStops.get(ticket)! : undefined };
}

function parseEvidence(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}
