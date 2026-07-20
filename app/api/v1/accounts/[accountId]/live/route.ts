import { getAppUser } from "@/lib/server/auth";
import { calculatePositionRisk } from "@/lib/domain/position-risk";
import { jsonError } from "@/lib/server/http";
import { requireDatabase } from "@/lib/server/runtime";
import { latestRiskCalculation } from "@/lib/server/risk-engine";
import { currentResetKey, currentRiskActions, dailyRiskAvailability, latestDailyPlan } from "@/lib/server/daily-risk";
import { buildCommandCentre } from "@/lib/server/command-centre";

export const dynamic = "force-dynamic";

type PositionRow = {
  ticket: string;
  symbol: string;
  direction: "buy" | "sell";
  volume_units: string;
  open_price_points: string;
  current_price_points: string;
  stop_loss_price_points: string | null;
  take_profit_price_points: string | null;
  price_digits: number | null;
  tick_size_points: string | null;
  tick_value_loss_minor_per_lot: string | null;
  swap_minor: string | null;
  floating_pnl_minor: string;
  opened_at: string;
};

export async function GET(_request: Request, context: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to view account data.", correlationId);
    const { accountId } = await context.params;
    if (!/^acct_[a-f0-9]{32}$/.test(accountId)) return jsonError(400, "account_id_invalid", "The account identifier is invalid.", correlationId);
    const database = await requireDatabase();
    const account = await database.prepare("SELECT ta.id, ta.label, ta.account_size_minor, ta.currency, ta.status, ta.rule_version_id, ac.state, ac.last_heartbeat_at, ac.last_snapshot_at, ac.last_trade_event_at, ac.connector_version, ac.risk_calculated_at FROM trading_accounts ta JOIN users u ON u.id = ta.owner_user_id LEFT JOIN account_connections ac ON ac.trading_account_id = ta.id WHERE ta.id = ? AND u.email = ? LIMIT 1")
      .bind(accountId, user.email.toLowerCase()).first<Record<string, unknown>>();
    if (!account) return jsonError(404, "account_not_found", "The account was not found.", correlationId);
    const snapshot = await database.prepare("SELECT observed_at, balance_minor, equity_minor, margin_minor, free_margin_minor, floating_pnl_minor, server_time, raw_payload_json FROM account_snapshots WHERE trading_account_id = ? ORDER BY observed_at DESC, id DESC LIMIT 1")
      .bind(accountId).first<Record<string, unknown>>();
    const positionRows = await database.prepare("SELECT ticket, symbol, direction, volume_units, open_price_points, current_price_points, stop_loss_price_points, take_profit_price_points, price_digits, tick_size_points, tick_value_loss_minor_per_lot, swap_minor, floating_pnl_minor, opened_at FROM positions WHERE trading_account_id = ? AND closed_at IS NULL ORDER BY opened_at DESC")
      .bind(accountId).all<PositionRow>();
    const pendingOrders = await database.prepare("SELECT ticket, symbol, order_type, volume_initial_units, volume_current_units, open_price_points, stop_loss_price_points, take_profit_price_points, placed_at, expires_at FROM pending_orders WHERE trading_account_id = ? AND closed_at IS NULL ORDER BY placed_at DESC")
      .bind(accountId).all<Record<string, unknown>>();
    const recentDeals = await database.prepare("SELECT ticket, order_ticket, position_ticket, symbol, deal_type, entry_type, volume_units, price_points, profit_minor, commission_minor, swap_minor, fee_minor, occurred_at FROM deals WHERE trading_account_id = ? ORDER BY occurred_at DESC LIMIT 50")
      .bind(accountId).all<Record<string, unknown>>();
    const positions = positionRows.results.map((position) => ({
      ...position,
      risk_at_stop_minor: riskAtStop(position),
    }));
    const positionsWithoutStop = positions.filter((position) => position.stop_loss_price_points === null).length;
    const positionsWithoutMetadata = positions.filter((position) => position.stop_loss_price_points !== null && position.risk_at_stop_minor === null).length;
    const knownRiskMinor = positions.reduce((total, position) => total + (position.risk_at_stop_minor === null ? 0n : BigInt(position.risk_at_stop_minor)), 0n);
    const riskCalculation = await latestRiskCalculation(database, accountId);
    const resetKey = await currentResetKey(database, accountId);
    const dailyPlan = resetKey ? await latestDailyPlan(database, accountId, resetKey) : null;
    const riskActions = await currentRiskActions(database, accountId);
    const riskActionHistory = (await currentRiskActions(database, accountId, true)).filter((action) => action.state === "resolved" || action.state === "dismissed");
    const actionAvailability = await dailyRiskAvailability(database, accountId, resetKey);
    const accountFreshness = freshness(account.last_heartbeat_at);
    const commandCentre = await buildCommandCentre(database, {
      accountId,
      ruleVersionId: typeof account.rule_version_id === "string" ? account.rule_version_id : null,
      resetKey,
      freshness: accountFreshness,
      snapshot: snapshot && typeof snapshot.observed_at === "string" && typeof snapshot.equity_minor === "string" && typeof snapshot.server_time === "string" ? { observedAt: snapshot.observed_at, equityMinor: snapshot.equity_minor, serverTime: snapshot.server_time, symbolSessions: snapshotSymbolSessions(snapshot.raw_payload_json) } : null,
      dealHistoryComplete: actionAvailability.dealHistory === "calculated",
    });
    return Response.json(
      {
        account,
        snapshot: snapshot ?? null,
        positions,
        pendingOrders: pendingOrders.results,
        recentDeals: recentDeals.results,
        riskSummary: {
          known_risk_minor: knownRiskMinor.toString(),
          positions_without_stop: positionsWithoutStop,
          positions_without_metadata: positionsWithoutMetadata,
          all_positions_covered: positionsWithoutStop === 0 && positionsWithoutMetadata === 0,
        },
        riskCalculation,
        dailyPlan,
        dailyPlanStatus: dailyPlan ? {
          riskBudgetRemainingMinor: positionsWithoutStop === 0 && positionsWithoutMetadata === 0
            ? (BigInt(dailyPlan.riskBudgetMinor) > knownRiskMinor ? BigInt(dailyPlan.riskBudgetMinor) - knownRiskMinor : 0n).toString()
            : null,
          knownRiskMinor: knownRiskMinor.toString(),
          riskCoverageComplete: positionsWithoutStop === 0 && positionsWithoutMetadata === 0,
        } : null,
        riskActions,
        riskActionHistory,
        riskActionAvailability: {
          marketClose: "unknown",
          marketCloseReason: "Authoritative symbol session-close data is not supplied by the connector.",
          healthScore: "not-calculated",
          healthScoreReason: "Component weights have not been approved.",
          dealHistory: actionAvailability.dealHistory,
          dealHistoryReason: actionAvailability.dealHistoryReason,
        },
        commandCentre,
        dataFreshness: accountFreshness,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError(503, "live_data_unavailable", "Live account data is temporarily unavailable.", correlationId);
  }
}

function snapshotSymbolSessions(rawPayload: unknown): unknown {
  if (typeof rawPayload !== "string") return undefined;
  try { return (JSON.parse(rawPayload) as Record<string, unknown>).symbolSessions; } catch { return undefined; }
}

function riskAtStop(position: PositionRow): string | null {
  if (position.stop_loss_price_points === null || position.tick_size_points === null || position.tick_value_loss_minor_per_lot === null) return null;
  try {
    return calculatePositionRisk({
      direction: position.direction,
      currentPricePoints: position.current_price_points,
      stopLossPricePoints: position.stop_loss_price_points,
      tickSizePoints: position.tick_size_points,
      tickValueLossMinorPerLot: position.tick_value_loss_minor_per_lot,
      volumeUnits: position.volume_units,
    })?.toString() ?? null;
  } catch {
    return null;
  }
}

function freshness(lastHeartbeatAt: unknown): "live" | "delayed" | "offline" {
  if (typeof lastHeartbeatAt !== "string") return "offline";
  const age = Date.now() - Date.parse(lastHeartbeatAt);
  if (age <= 15_000) return "live";
  if (age <= 60_000) return "delayed";
  return "offline";
}
