import { getAppUser } from "@/lib/server/auth";
import { jsonError, safeJson } from "@/lib/server/http";
import { currentResetKey, latestDailyPlan, reevaluateStoredDailyRisk, saveDailyPlan } from "@/lib/server/daily-risk";
import { requireDatabase } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

type OwnedAccount = { id: string; owner_user_id: string };

export async function GET(_request: Request, context: { params: Promise<{ accountId: string }> }): Promise<Response> {
  return handle(context, async (database, account) => {
    const resetKey = await currentResetKey(database, account.id);
    return Response.json({ dailyPlan: resetKey ? await latestDailyPlan(database, account.id, resetKey) : null, resetKey }, { headers: { "Cache-Control": "no-store" } });
  });
}

export async function PUT(request: Request, context: { params: Promise<{ accountId: string }> }): Promise<Response> {
  return handle(context, async (database, account) => {
    const resetKey = await currentResetKey(database, account.id);
    if (!resetKey) return jsonError(409, "snapshot_required", "A current broker snapshot is required before saving today’s plan.");
    const body = await safeJson(request);
    const dailyPlan = await saveDailyPlan(database, {
      accountId: account.id,
      userId: account.owner_user_id,
      resetKey,
      riskBudgetMinor: requiredAmount(body.riskBudgetMinor, "Daily risk budget"),
      maxRiskPerTradeMinor: requiredAmount(body.maxRiskPerTradeMinor, "Maximum risk per trade"),
      maxTrades: requiredTrades(body.maxTrades),
      lossStopMinor: requiredAmount(body.lossStopMinor, "Daily loss stop"),
      profitLockMinor: requiredAmount(body.profitLockMinor, "Profit lock"),
      preservationMode: requiredMode(body.preservationMode),
    });
    await reevaluateStoredDailyRisk(database, account.id);
    return Response.json({ dailyPlan });
  });
}

async function handle(context: { params: Promise<{ accountId: string }> }, work: (database: Awaited<ReturnType<typeof requireDatabase>>, account: OwnedAccount) => Promise<Response>): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to manage the daily risk plan.", correlationId);
    const { accountId } = await context.params;
    if (!/^acct_[a-f0-9]{32}$/.test(accountId)) return jsonError(400, "account_id_invalid", "The account identifier is invalid.", correlationId);
    const database = await requireDatabase();
    const account = await database.prepare("SELECT ta.id, ta.owner_user_id FROM trading_accounts ta JOIN users u ON u.id = ta.owner_user_id WHERE ta.id = ? AND u.email = ? LIMIT 1").bind(accountId, user.email.toLowerCase()).first<OwnedAccount>();
    if (!account) return jsonError(404, "account_not_found", "The account was not found.", correlationId);
    return await work(database, account);
  } catch (error) {
    const message = error instanceof Error && !/database|binding|secret|sql/i.test(error.message) ? error.message : "The daily risk plan could not be saved.";
    return jsonError(400, "daily_plan_rejected", message, correlationId);
  }
}

function requiredAmount(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(`${label} must be a non-negative amount in minor units.`);
  return value;
}

function requiredTrades(value: unknown): number {
  if (!Number.isInteger(value)) throw new Error("Maximum trades must be an integer.");
  return Number(value);
}

function requiredMode(value: unknown): "off" | "manual" | "profit-lock" {
  if (value !== "off" && value !== "manual" && value !== "profit-lock") throw new Error("Preservation mode is invalid.");
  return value;
}
