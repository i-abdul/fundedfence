import { getAppUser } from "@/lib/server/auth";
import { isCanonicalMinorUnits, jsonError, safeJson } from "@/lib/server/http";
import { requireDatabase } from "@/lib/server/runtime";
import { simulateLatestRiskCalculation } from "@/lib/server/risk-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to simulate account risk.", correlationId);
    const { accountId } = await context.params;
    if (!/^acct_[a-f0-9]{32}$/.test(accountId)) return jsonError(400, "account_id_invalid", "The account identifier is invalid.", correlationId);
    const body = await safeJson(request);
    const withdrawalMinor = optionalNonNegativeMinor(body.withdrawalMinor, "Withdrawal");
    const gapReserveMinor = optionalNonNegativeMinor(body.gapReserveMinor, "Gap reserve") ?? "0";
    const payoutPeriod = optionalPayoutPeriod(body.payoutPeriodStart, body.payoutPeriodEnd);
    const database = await requireDatabase();
    const account = await database.prepare("SELECT ta.id FROM trading_accounts ta JOIN users u ON u.id = ta.owner_user_id WHERE ta.id = ? AND u.email = ? LIMIT 1")
      .bind(accountId, user.email.toLowerCase()).first<{ id: string }>();
    if (!account) return jsonError(404, "account_not_found", "The account was not found.", correlationId);
    const simulation = await simulateLatestRiskCalculation(database, accountId, { withdrawalMinor, gapReserveMinor, payoutPeriod });
    if (!simulation) return jsonError(409, "risk_calculation_required", "A current effective rule calculation is required before running a simulation.", correlationId);
    return Response.json(simulation, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && !/database|binding|secret|sql/i.test(error.message)
      ? error.message
      : "The risk simulation is temporarily unavailable.";
    return jsonError(400, "risk_simulation_rejected", message, correlationId);
  }
}

function optionalPayoutPeriod(start: unknown, end: unknown): { startsAt: string; endsAt: string } | null {
  if (start == null && end == null) return null;
  if (typeof start !== "string" || typeof end !== "string" || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) {
    throw new Error("Payout period start and end must both be valid ISO timestamps.");
  }
  const startsAt = new Date(start).toISOString();
  const endsAt = new Date(end).toISOString();
  if (startsAt >= endsAt) throw new Error("Payout period end must be after its start.");
  return { startsAt, endsAt };
}

function optionalNonNegativeMinor(value: unknown, label: string): string | null {
  if (value == null || value === "") return null;
  if (!isCanonicalMinorUnits(value) || value.startsWith("-")) throw new Error(`${label} must be a non-negative amount in minor units.`);
  return value;
}
