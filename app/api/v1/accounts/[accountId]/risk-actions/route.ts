import { getAppUser } from "@/lib/server/auth";
import { jsonError, safeJson } from "@/lib/server/http";
import { currentRiskActions, transitionRiskAction } from "@/lib/server/daily-risk";
import { requireDatabase } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

type OwnedAccount = { id: string; owner_user_id: string; organization_id: string };

export async function GET(_request: Request, context: { params: Promise<{ accountId: string }> }): Promise<Response> {
  return handle(context, async (database, account) => Response.json({ actions: await currentRiskActions(database, account.id, true) }, { headers: { "Cache-Control": "no-store" } }));
}

export async function PATCH(request: Request, context: { params: Promise<{ accountId: string }> }): Promise<Response> {
  return handle(context, async (database, account) => {
    const body = await safeJson(request);
    const actionId = requiredActionId(body.actionId);
    const transition = requiredTransition(body.transition);
    const reason = optionalReason(body.reason);
    await transitionRiskAction(database, { accountId: account.id, organizationId: account.organization_id, userId: account.owner_user_id, actionId, transition, reason });
    return Response.json({ actions: await currentRiskActions(database, account.id, true) });
  });
}

async function handle(context: { params: Promise<{ accountId: string }> }, work: (database: Awaited<ReturnType<typeof requireDatabase>>, account: OwnedAccount) => Promise<Response>): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to manage risk actions.", correlationId);
    const { accountId } = await context.params;
    if (!/^acct_[a-f0-9]{32}$/.test(accountId)) return jsonError(400, "account_id_invalid", "The account identifier is invalid.", correlationId);
    const database = await requireDatabase();
    const account = await database.prepare("SELECT ta.id, ta.owner_user_id, ta.organization_id FROM trading_accounts ta JOIN users u ON u.id = ta.owner_user_id WHERE ta.id = ? AND u.email = ? LIMIT 1").bind(accountId, user.email.toLowerCase()).first<OwnedAccount>();
    if (!account) return jsonError(404, "account_not_found", "The account was not found.", correlationId);
    return await work(database, account);
  } catch (error) {
    const message = error instanceof Error && !/database|binding|secret|sql/i.test(error.message) ? error.message : "The risk action could not be updated.";
    const status = message === "Risk action not found." ? 404 : 400;
    return jsonError(status, status === 404 ? "risk_action_not_found" : "risk_action_rejected", message, correlationId);
  }
}

function requiredActionId(value: unknown): string {
  if (typeof value !== "string" || !/^alert_[a-f0-9]{24}$/.test(value)) throw new Error("The risk action identifier is invalid.");
  return value;
}

function requiredTransition(value: unknown): "acknowledge" | "resolve" | "dismiss" {
  if (value !== "acknowledge" && value !== "resolve" && value !== "dismiss") throw new Error("The risk action transition is invalid.");
  return value;
}

function optionalReason(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > 500) throw new Error("The action reason is invalid.");
  return value.trim();
}
