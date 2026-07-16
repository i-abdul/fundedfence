import { getAppUser } from "@/lib/server/auth";
import { jsonError, safeJson } from "@/lib/server/http";
import { requireDatabase } from "@/lib/server/runtime";
import {
  isRuleAdmin,
  listRuleProfiles,
  transitionRuleVersion,
  type RuleWorkflowAction,
} from "@/lib/server/rule-profiles";

export const dynamic = "force-dynamic";

const workflowActions: RuleWorkflowAction[] = ["approve", "activate", "rollback"];

export async function GET(): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to view rule profiles.", correlationId);
    const database = await requireDatabase();
    return Response.json({ profiles: await listRuleProfiles(database), canAdmin: isRuleAdmin(user.email) });
  } catch {
    return jsonError(503, "rule_profiles_unavailable", "Rule profiles are temporarily unavailable.", correlationId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to manage rule profiles.", correlationId);
    if (!isRuleAdmin(user.email)) return jsonError(403, "rule_admin_required", "Your account is not authorized to manage rule versions.", correlationId);
    const body = await safeJson(request);
    const action = requiredAction(body.action);
    const versionId = requiredVersionId(body.versionId);
    const reason = optionalReason(body.reason);
    const database = await requireDatabase();
    return Response.json(await transitionRuleVersion(database, user, action, versionId, reason));
  } catch (error) {
    return jsonError(400, "rule_workflow_rejected", publicMessage(error), correlationId);
  }
}

function requiredAction(value: unknown): RuleWorkflowAction {
  if (typeof value !== "string" || !workflowActions.includes(value as RuleWorkflowAction)) throw new Error("The requested rule action is invalid.");
  return value as RuleWorkflowAction;
}

function requiredVersionId(value: unknown): string {
  if (typeof value !== "string" || !/^rulever_[a-z0-9_]{4,100}$/.test(value)) throw new Error("The rule version identifier is invalid.");
  return value;
}

function optionalReason(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 500) throw new Error("The workflow reason is invalid.");
  return value.trim();
}

function publicMessage(error: unknown): string {
  if (error instanceof Error && !/database|binding|secret|sql/i.test(error.message)) return error.message;
  return "The rule workflow could not be completed.";
}
