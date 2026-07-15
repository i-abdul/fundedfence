import { issueDeviceToken, verifyDeviceToken } from "@/lib/domain/connector-protocol";
import { sha256Hex } from "@/lib/server/crypto";
import { jsonError, readBearerToken } from "@/lib/server/http";
import { requireDatabase, requireSecret } from "@/lib/server/runtime";

export async function POST(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const refreshToken = readBearerToken(request);
    if (!refreshToken) return jsonError(401, "refresh_token_required", "A refresh token is required.", correlationId);
    const secret = await requireSecret("CONNECTOR_TOKEN_SECRET");
    const claims = await verifyDeviceToken(refreshToken, secret);
    if (claims.tokenType !== "refresh") return jsonError(401, "invalid_token_type", "A refresh token is required.", correlationId);
    const database = await requireDatabase();
    const device = await database.prepare("SELECT revoked_at FROM connector_devices WHERE id = ? AND trading_account_id = ?")
      .bind(claims.deviceId, claims.accountId).first<{ revoked_at: string | null }>();
    if (!device || device.revoked_at) return jsonError(401, "connector_revoked", "This connector has been revoked.", correlationId);
    const now = Date.now();
    const accessToken = await issueDeviceToken({ deviceId: claims.deviceId, accountId: claims.accountId, tokenType: "access", issuedAt: now, expiresAt: now + 15 * 60 * 1000, nonce: crypto.randomUUID() }, secret);
    await database.prepare("UPDATE connector_devices SET token_fingerprint = ?, updated_at = ? WHERE id = ?")
      .bind(await sha256Hex(accessToken), new Date(now).toISOString(), claims.deviceId).run();
    return Response.json({ accessToken, expiresAt: new Date(now + 15 * 60 * 1000).toISOString() });
  } catch {
    return jsonError(401, "refresh_rejected", "The connector session could not be refreshed.", correlationId);
  }
}
