import { getAppUser } from "@/lib/server/auth";
import { generatePairingCode, hashPairingCode } from "@/lib/domain/pairing";
import { jsonError, safeJson } from "@/lib/server/http";
import { stableId } from "@/lib/server/crypto";
import { requireDatabase, requireSecret } from "@/lib/server/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in before creating a pairing code.", correlationId);
    const body = await safeJson(request);
    const accountLabel = requiredText(body.accountLabel, "accountLabel", 80);
    const accountSizeMinor = requiredMinor(body.accountSizeMinor, "accountSizeMinor");
    const currency = requiredCurrency(body.currency);
    const firmLabel = requiredText(body.firmLabel, "firmLabel", 80);
    const programLabel = requiredText(body.programLabel, "programLabel", 100);

    const database = await requireDatabase();
    const pepper = await requireSecret("PAIRING_PEPPER");
    const now = new Date();
    const nowIso = now.toISOString();
    const userId = await stableId("usr", user.email.toLowerCase());
    const organizationId = await stableId("org", user.email.toLowerCase());
    const accountId = `acct_${crypto.randomUUID().replace(/-/g, "")}`;
    const pairingId = `pair_${crypto.randomUUID().replace(/-/g, "")}`;
    const code = generatePairingCode();
    const codeHash = await hashPairingCode(code, pepper);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    await database.batch([
      database.prepare("INSERT OR IGNORE INTO organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(organizationId, `${user.displayName}'s workspace`, nowIso, nowIso),
      database.prepare("INSERT OR IGNORE INTO users (id, organization_id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(userId, organizationId, user.email.toLowerCase(), user.displayName, nowIso, nowIso),
      database.prepare("INSERT INTO trading_accounts (id, organization_id, owner_user_id, program_id, rule_version_id, label, account_size_minor, currency, status, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 'pairing', ?, ?)")
        .bind(accountId, organizationId, userId, `${accountLabel} · ${firmLabel} ${programLabel}`, accountSizeMinor, currency, nowIso, nowIso),
      database.prepare("INSERT INTO pairing_codes (id, trading_account_id, owner_user_id, code_hash, expires_at, used_at, attempts_remaining, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 5, ?, ?)")
        .bind(pairingId, accountId, userId, codeHash, expiresAt, nowIso, nowIso),
      database.prepare("INSERT INTO audit_events (id, organization_id, trading_account_id, actor_type, actor_id, event_type, occurred_at, correlation_id, payload_json, previous_hash, event_hash) VALUES (?, ?, ?, 'user', ?, 'pairing.code_created', ?, ?, ?, NULL, ?)")
        .bind(`audit_${crypto.randomUUID().replace(/-/g, "")}`, organizationId, accountId, userId, nowIso, correlationId, JSON.stringify({ expiresAt, firmLabel, programLabel }), codeHash),
    ]);

    return Response.json({ pairingCode: code, expiresAt, accountId, singleUse: true }, { status: 201 });
  } catch (error) {
    return jsonError(400, "pairing_code_not_created", publicMessage(error), correlationId);
  }
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${field} is invalid.`);
  return value.trim();
}

function requiredMinor(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{3,18}$/.test(value) || BigInt(value) <= 0n) throw new Error(`${field} is invalid.`);
  return value;
}

function requiredCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw new Error("currency is invalid.");
  return value;
}

function publicMessage(error: unknown): string {
  if (error instanceof Error && !/binding|secret|database/i.test(error.message)) return error.message;
  return "The pairing code could not be created. Check the account details and try again.";
}
