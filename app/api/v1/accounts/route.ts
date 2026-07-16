import { getAppUser } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { requireDatabase } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  label: string;
  account_size_minor: string;
  currency: string;
  status: string;
  state: string | null;
  last_heartbeat_at: string | null;
  last_snapshot_at: string | null;
  updated_at: string;
};

export async function GET(): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to view trading accounts.", correlationId);
    const database = await requireDatabase();
    const accounts = await database.prepare("SELECT ta.id, ta.label, ta.account_size_minor, ta.currency, ta.status, ac.state, ac.last_heartbeat_at, ac.last_snapshot_at, ta.updated_at FROM trading_accounts ta JOIN users u ON u.id = ta.owner_user_id LEFT JOIN account_connections ac ON ac.trading_account_id = ta.id WHERE u.email = ? ORDER BY CASE WHEN ta.status = 'connected' THEN 0 ELSE 1 END, COALESCE(ac.last_heartbeat_at, ta.updated_at) DESC LIMIT 50")
      .bind(user.email.toLowerCase()).all<AccountRow>();
    return Response.json(
      { accounts: accounts.results.map((account) => ({ ...account, data_freshness: freshness(account.last_heartbeat_at) })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError(503, "accounts_unavailable", "Trading accounts are temporarily unavailable.", correlationId);
  }
}

function freshness(lastHeartbeatAt: string | null): "live" | "delayed" | "offline" {
  if (!lastHeartbeatAt) return "offline";
  const age = Date.now() - Date.parse(lastHeartbeatAt);
  if (age <= 15_000) return "live";
  if (age <= 60_000) return "delayed";
  return "offline";
}
