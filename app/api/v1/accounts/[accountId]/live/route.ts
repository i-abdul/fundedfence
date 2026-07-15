import { getAppUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { requireDatabase } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to view account data.", correlationId);
    const { accountId } = await context.params;
    if (!/^acct_[a-f0-9]{32}$/.test(accountId)) return jsonError(400, "account_id_invalid", "The account identifier is invalid.", correlationId);
    const database = await requireDatabase();
    const account = await database.prepare("SELECT ta.id, ta.label, ta.account_size_minor, ta.currency, ta.status, ac.state, ac.last_heartbeat_at, ac.last_snapshot_at, ac.last_trade_event_at, ac.connector_version FROM trading_accounts ta JOIN users u ON u.id = ta.owner_user_id LEFT JOIN account_connections ac ON ac.trading_account_id = ta.id WHERE ta.id = ? AND u.email = ? LIMIT 1")
      .bind(accountId, user.email.toLowerCase()).first<Record<string, unknown>>();
    if (!account) return jsonError(404, "account_not_found", "The account was not found.", correlationId);
    const snapshot = await database.prepare("SELECT observed_at, balance_minor, equity_minor, margin_minor, free_margin_minor, floating_pnl_minor, server_time FROM account_snapshots WHERE trading_account_id = ? ORDER BY sequence DESC LIMIT 1")
      .bind(accountId).first<Record<string, unknown>>();
    const positions = await database.prepare("SELECT ticket, symbol, direction, volume_units, open_price_points, current_price_points, stop_loss_price_points, take_profit_price_points, floating_pnl_minor, opened_at FROM positions WHERE trading_account_id = ? AND closed_at IS NULL ORDER BY opened_at DESC")
      .bind(accountId).all<Record<string, unknown>>();
    return Response.json({ account, snapshot: snapshot ?? null, positions: positions.results, dataFreshness: freshness(account.last_heartbeat_at) });
  } catch {
    return jsonError(503, "live_data_unavailable", "Live account data is temporarily unavailable.", correlationId);
  }
}

function freshness(lastHeartbeatAt: unknown): "live" | "delayed" | "offline" {
  if (typeof lastHeartbeatAt !== "string") return "offline";
  const age = Date.now() - Date.parse(lastHeartbeatAt);
  if (age <= 15_000) return "live";
  if (age <= 60_000) return "delayed";
  return "offline";
}
