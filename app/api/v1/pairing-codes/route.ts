import { getAppUser } from "@/lib/server/auth";
import { generatePairingCode, hashPairingCode, pairingCodeStatus, PAIRING_CODE_TTL_MS } from "@/lib/domain/pairing";
import { jsonError, safeJson } from "@/lib/server/http";
import { stableId } from "@/lib/server/crypto";
import { requireDatabase, requireSecret } from "@/lib/server/runtime";
import { findSeedRuleProfile } from "@/lib/product/fundednext-rule-catalog";
import { ensureFundedNextRuleCatalog } from "@/lib/server/rule-profiles";

export const dynamic = "force-dynamic";

type AccountRow = {
  account_id: string;
  label: string;
  status: string;
  connection_state: string | null;
  last_heartbeat_at: string | null;
  last_snapshot_at: string | null;
};

type PairingRow = AccountRow & {
  expires_at: string;
  used_at: string | null;
};

type OwnedAccountRow = {
  id: string;
  organization_id: string;
  owner_user_id: string;
};

type ActiveRuleRow = {
  id: string;
};

export async function GET(): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getAppUser();
    if (!user) return jsonError(401, "authentication_required", "Sign in to view pairing status.", correlationId);
    const database = await requireDatabase();
    const email = user.email.toLowerCase();
    const latestPairing = await database.prepare(
      "SELECT ta.id AS account_id, ta.label, ta.status, ac.state AS connection_state, ac.last_heartbeat_at, ac.last_snapshot_at, pc.expires_at, pc.used_at FROM pairing_codes pc JOIN trading_accounts ta ON ta.id = pc.trading_account_id JOIN users u ON u.id = ta.owner_user_id LEFT JOIN account_connections ac ON ac.trading_account_id = ta.id WHERE u.email = ? ORDER BY pc.created_at DESC LIMIT 1",
    ).bind(email).first<PairingRow>();
    const latestConnectedAccount = await database.prepare(
      "SELECT ta.id AS account_id, ta.label, ta.status, ac.state AS connection_state, ac.last_heartbeat_at, ac.last_snapshot_at FROM trading_accounts ta JOIN users u ON u.id = ta.owner_user_id LEFT JOIN account_connections ac ON ac.trading_account_id = ta.id WHERE u.email = ? AND ta.status = 'connected' ORDER BY COALESCE(ac.last_heartbeat_at, ta.updated_at) DESC LIMIT 1",
    ).bind(email).first<AccountRow>();
    const status = latestPairing ? pairingCodeStatus(latestPairing.expires_at, latestPairing.used_at) : null;
    const trackedAccount = status === "active" ? latestPairing : latestConnectedAccount ?? latestPairing;

    return Response.json({
      trackedAccount: trackedAccount ? publicAccount(trackedAccount) : null,
      latestPairing: latestPairing ? {
        accountId: latestPairing.account_id,
        expiresAt: latestPairing.expires_at,
        status,
      } : null,
    });
  } catch {
    return jsonError(503, "pairing_status_unavailable", "Pairing status is temporarily unavailable.", correlationId);
  }
}

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
    const firmId = optionalText(body.firmId, 80);
    const programId = optionalText(body.programId, 100);
    const phase = optionalText(body.phase, 40);
    const platform = optionalText(body.platform, 20) ?? "mt5";
    const accountPrice = optionalText(body.accountPrice, 40);
    const requestedAccountId = optionalAccountId(body.accountId);
    const ruleProfile = firmId === "fundednext" ? findSeedRuleProfile(programId, phase) : undefined;
    if (!ruleProfile) throw new Error("The selected firm, program, or phase does not have a validated rule profile.");
    if (!ruleProfile.definition.applicableAccountSizesMinor.includes(accountSizeMinor)) throw new Error("The selected account size is not valid for this rule profile.");
    if (ruleProfile.definition.currency !== currency || !ruleProfile.definition.platforms.includes(platform.toUpperCase())) throw new Error("The selected currency or platform is not supported by this rule profile.");

    const database = await requireDatabase();
    await ensureFundedNextRuleCatalog(database);
    const pepper = await requireSecret("PAIRING_PEPPER");
    const now = new Date();
    const nowIso = now.toISOString();
    const userId = await stableId("usr", user.email.toLowerCase());
    const organizationId = await stableId("org", user.email.toLowerCase());
    const ownedAccount = requestedAccountId
      ? await database.prepare("SELECT ta.id, ta.organization_id, ta.owner_user_id FROM trading_accounts ta JOIN users u ON u.id = ta.owner_user_id WHERE ta.id = ? AND u.email = ? LIMIT 1")
        .bind(requestedAccountId, user.email.toLowerCase()).first<OwnedAccountRow>()
      : null;
    if (requestedAccountId && !ownedAccount) throw new Error("The account is not available for re-pairing.");
    const accountId = ownedAccount?.id ?? `acct_${crypto.randomUUID().replace(/-/g, "")}`;
    const accountOrganizationId = ownedAccount?.organization_id ?? organizationId;
    const accountOwnerUserId = ownedAccount?.owner_user_id ?? userId;
    const replacingDevice = Boolean(ownedAccount);
    const activeRule = await database.prepare("SELECT rv.id FROM rule_sets rs JOIN rule_versions rv ON rv.id = rs.active_version_id WHERE rs.program_id = ? AND rv.verification_status = 'effective' LIMIT 1")
      .bind(ruleProfile.programId).first<ActiveRuleRow>();
    const pairingId = `pair_${crypto.randomUUID().replace(/-/g, "")}`;
    const code = generatePairingCode();
    const codeHash = await hashPairingCode(code, pepper);
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS).toISOString();

    const statements = [
      database.prepare("INSERT OR IGNORE INTO organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(organizationId, `${user.displayName}'s workspace`, nowIso, nowIso),
      database.prepare("INSERT OR IGNORE INTO users (id, organization_id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(userId, organizationId, user.email.toLowerCase(), user.displayName, nowIso, nowIso),
      database.prepare("UPDATE pairing_codes SET expires_at = ?, updated_at = ? WHERE owner_user_id = ? AND used_at IS NULL AND expires_at > ?")
        .bind(nowIso, nowIso, userId, nowIso),
      database.prepare("INSERT INTO pairing_codes (id, trading_account_id, owner_user_id, code_hash, expires_at, used_at, attempts_remaining, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, 5, ?, ?)")
        .bind(pairingId, accountId, accountOwnerUserId, codeHash, expiresAt, nowIso, nowIso),
      database.prepare("INSERT INTO audit_events (id, organization_id, trading_account_id, actor_type, actor_id, event_type, occurred_at, correlation_id, payload_json, previous_hash, event_hash) VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, NULL, ?)")
        .bind(`audit_${crypto.randomUUID().replace(/-/g, "")}`, accountOrganizationId, accountId, accountOwnerUserId, replacingDevice ? "connector.repair_requested" : "pairing.code_created", nowIso, correlationId, JSON.stringify({ expiresAt, firmId, firmLabel, programId, programLabel, phase, platform, accountPrice }), codeHash),
    ];
    if (replacingDevice) {
      statements.splice(3, 0,
        database.prepare("UPDATE connector_devices SET revoked_at = COALESCE(revoked_at, ?), updated_at = ? WHERE trading_account_id = ? AND revoked_at IS NULL")
          .bind(nowIso, nowIso, accountId),
        database.prepare("UPDATE account_connections SET state = 'reconnecting', last_heartbeat_at = NULL, connector_version = NULL, updated_at = ? WHERE trading_account_id = ?")
          .bind(nowIso, accountId),
        database.prepare("UPDATE trading_accounts SET program_id = ?, rule_version_id = ?, label = ?, account_size_minor = ?, currency = ?, status = 'pairing', updated_at = ? WHERE id = ?")
          .bind(ruleProfile.programId, activeRule?.id ?? null, `${accountLabel} · ${firmLabel} ${programLabel}`, accountSizeMinor, currency, nowIso, accountId),
      );
    } else {
      statements.splice(3, 0,
        database.prepare("INSERT INTO trading_accounts (id, organization_id, owner_user_id, program_id, rule_version_id, label, account_size_minor, currency, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pairing', ?, ?)")
          .bind(accountId, organizationId, userId, ruleProfile.programId, activeRule?.id ?? null, `${accountLabel} · ${firmLabel} ${programLabel}`, accountSizeMinor, currency, nowIso, nowIso),
      );
    }
    await database.batch(statements);

    return Response.json({ pairingCode: code, expiresAt, accountId, singleUse: true, replacingDevice }, { status: 201 });
  } catch (error) {
    return jsonError(400, "pairing_code_not_created", publicMessage(error), correlationId);
  }
}

function publicAccount(row: AccountRow) {
  return {
    accountId: row.account_id,
    label: row.label,
    status: row.status,
    connectionState: row.connection_state,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastSnapshotAt: row.last_snapshot_at,
  };
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${field} is invalid.`);
  return value.trim();
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maxLength) throw new Error("Optional account metadata is invalid.");
  return value.trim();
}

function optionalAccountId(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !/^acct_[a-f0-9]{32}$/.test(value)) throw new Error("The account identifier is invalid.");
  return value;
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
