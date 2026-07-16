import { CONNECTOR_PROTOCOL_VERSION, issueDeviceToken } from "@/lib/domain/connector-protocol";
import { hashPairingCode, normalizePairingCode } from "@/lib/domain/pairing";
import { sha256Hex } from "@/lib/server/crypto";
import type { AppDatabase } from "@/lib/server/database";
import { jsonError, safeJson } from "@/lib/server/http";
import { requireDatabase, requireSecret } from "@/lib/server/runtime";

type PairingRow = {
  id: string;
  trading_account_id: string;
  organization_id: string;
  expires_at: string;
  used_at: string | null;
  attempts_remaining: number;
};

export async function POST(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const database = await requireDatabase();
    const pepper = await requireSecret("PAIRING_PEPPER");
    const tokenSecret = await requireSecret("CONNECTOR_TOKEN_SECRET");
    const body = await safeJson(request);
    const code = normalizePairingCode(String(body.pairingCode ?? ""));
    const hashedLogin = requiredIdentifier(body.hashedLogin, "hashedLogin", 128);
    const serverIdentity = requiredText(body.serverIdentity, "serverIdentity", 160);
    const platformVersion = requiredText(body.platformVersion, "platformVersion", 40);
    const connectorVersion = requiredText(body.connectorVersion, "connectorVersion", 40);
    await enforceRateLimit(database, request, pepper);

    const codeHash = await hashPairingCode(code, pepper);
    const row = await database.prepare(
      "SELECT pc.id, pc.trading_account_id, ta.organization_id, pc.expires_at, pc.used_at, pc.attempts_remaining FROM pairing_codes pc JOIN trading_accounts ta ON ta.id = pc.trading_account_id WHERE pc.code_hash = ? LIMIT 1",
    ).bind(codeHash).first<PairingRow>();

    if (!row || row.used_at || row.attempts_remaining <= 0 || Date.parse(row.expires_at) <= Date.now()) {
      if (row && !row.used_at) {
        await database.prepare("UPDATE pairing_codes SET attempts_remaining = MAX(0, attempts_remaining - 1), updated_at = ? WHERE id = ?")
          .bind(new Date().toISOString(), row.id).run();
      }
      return jsonError(401, "pairing_rejected", "The pairing code is invalid, expired, or already used.", correlationId);
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const deviceId = `dev_${crypto.randomUUID().replace(/-/g, "")}`;
    const connectionId = `conn_${crypto.randomUUID().replace(/-/g, "")}`;
    const commonClaims = { deviceId, accountId: row.trading_account_id, issuedAt: now };
    const accessToken = await issueDeviceToken({ ...commonClaims, tokenType: "access", expiresAt: now + 15 * 60 * 1000, nonce: crypto.randomUUID() }, tokenSecret);
    const refreshToken = await issueDeviceToken({ ...commonClaims, tokenType: "refresh", expiresAt: now + 7 * 24 * 60 * 60 * 1000, nonce: crypto.randomUUID() }, tokenSecret);
    const tokenFingerprint = await sha256Hex(accessToken);

    await database.batch([
      database.prepare("UPDATE pairing_codes SET used_at = ?, updated_at = ? WHERE id = ? AND used_at IS NULL")
        .bind(nowIso, nowIso, row.id),
      database.prepare("INSERT INTO connector_devices (id, trading_account_id, token_fingerprint, last_sequence, connector_version, platform_version, revoked_at, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, NULL, ?, ?)")
        .bind(deviceId, row.trading_account_id, tokenFingerprint, connectorVersion, platformVersion, nowIso, nowIso),
      database.prepare("INSERT OR IGNORE INTO account_connections (id, trading_account_id, state, connector_version, created_at, updated_at) VALUES (?, ?, 'reconnecting', ?, ?, ?)")
        .bind(connectionId, row.trading_account_id, connectorVersion, nowIso, nowIso),
      database.prepare("UPDATE trading_accounts SET hashed_login = ?, server_identity = ?, status = 'connected', updated_at = ? WHERE id = ?")
        .bind(hashedLogin, serverIdentity, nowIso, row.trading_account_id),
      database.prepare("INSERT INTO audit_events (id, organization_id, trading_account_id, actor_type, actor_id, event_type, occurred_at, correlation_id, payload_json, previous_hash, event_hash) VALUES (?, ?, ?, 'connector', ?, 'connector.paired', ?, ?, ?, NULL, ?)")
        .bind(`audit_${crypto.randomUUID().replace(/-/g, "")}`, row.organization_id, row.trading_account_id, deviceId, nowIso, correlationId, JSON.stringify({ connectorVersion, platformVersion, serverIdentity }), tokenFingerprint),
    ]);

    return Response.json({
      deviceId,
      accountId: row.trading_account_id,
      accessToken,
      accessTokenExpiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ingestionEndpoint: new URL("/api/v1/connector/events", request.url).toString(),
      refreshEndpoint: new URL("/api/v1/connector/refresh", request.url).toString(),
      configurationVersion: "1",
      protocolVersion: CONNECTOR_PROTOCOL_VERSION,
    });
  } catch (error) {
    return jsonError(400, "pairing_rejected", publicMessage(error), correlationId);
  }
}

async function enforceRateLimit(database: AppDatabase, request: Request, pepper: string): Promise<void> {
  const source = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const keyHash = await sha256Hex(`pair-rate:${pepper}:${source}`);
  const now = Date.now();
  const existing = await database.prepare("SELECT window_started_at, attempts FROM pairing_rate_limits WHERE key_hash = ?")
    .bind(keyHash).first<{ window_started_at: string; attempts: number }>();
  const windowExpired = !existing || Date.parse(existing.window_started_at) + 10 * 60 * 1000 <= now;
  if (existing && !windowExpired && existing.attempts >= 10) throw new Error("Too many pairing attempts. Try again later.");
  if (windowExpired) {
    await database.prepare("INSERT INTO pairing_rate_limits (key_hash, window_started_at, attempts, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(key_hash) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1, updated_at = excluded.updated_at")
      .bind(keyHash, new Date(now).toISOString(), new Date(now).toISOString()).run();
  } else {
    await database.prepare("UPDATE pairing_rate_limits SET attempts = attempts + 1, updated_at = ? WHERE key_hash = ?")
      .bind(new Date(now).toISOString(), keyHash).run();
  }
}

function requiredIdentifier(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.length < 8 || value.length > maxLength || !/^[a-zA-Z0-9:_-]+$/.test(value)) throw new Error(`${field} is invalid.`);
  return value;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${field} is invalid.`);
  return value.trim();
}

function publicMessage(error: unknown): string {
  if (error instanceof Error && !/binding|secret|database/i.test(error.message)) return error.message;
  return "Pairing is temporarily unavailable. Verify the code and connector configuration.";
}
