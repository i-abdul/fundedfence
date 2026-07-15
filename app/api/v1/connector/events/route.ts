import {
  canonicalStringify,
  validateEnvelope,
  verifyDeviceToken,
  verifyRawEnvelopeSignature,
} from "@/lib/domain/connector-protocol";
import { sha256Hex, stableId } from "@/lib/server/crypto";
import type { AppDatabase, AppPreparedStatement } from "@/lib/server/database";
import { isCanonicalMinorUnits, jsonError, readBearerToken } from "@/lib/server/http";
import { requireDatabase, requireSecret } from "@/lib/server/runtime";

type DeviceRow = {
  trading_account_id: string;
  organization_id: string;
  last_sequence: number;
  revoked_at: string | null;
};

type SnapshotAccount = {
  balanceMinor: string;
  equityMinor: string;
  marginMinor: string;
  freeMarginMinor: string;
  floatingPnlMinor: string;
  serverTime: string;
};

export async function POST(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  try {
    const accessToken = readBearerToken(request);
    const signature = request.headers.get("x-fundedfence-signature") ?? "";
    if (!accessToken || !signature) return jsonError(401, "connector_auth_required", "Connector authentication and signature are required.", correlationId);
    const secret = await requireSecret("CONNECTOR_TOKEN_SECRET");
    const claims = await verifyDeviceToken(accessToken, secret);
    if (claims.tokenType !== "access") return jsonError(401, "invalid_token_type", "An access token is required.", correlationId);
    const rawEnvelope = await request.text();
    const envelope = validateEnvelope(JSON.parse(rawEnvelope));
    if (envelope.connectorId !== claims.deviceId || envelope.accountId !== claims.accountId) {
      return jsonError(403, "connector_scope_mismatch", "The connector credential does not own this account.", correlationId);
    }
    if (!(await verifyRawEnvelopeSignature(accessToken, rawEnvelope, signature))) {
      return jsonError(401, "signature_invalid", "The connector message signature is invalid.", correlationId);
    }

    const database = await requireDatabase();
    const device = await database.prepare(
      "SELECT cd.trading_account_id, ta.organization_id, cd.last_sequence, cd.revoked_at FROM connector_devices cd JOIN trading_accounts ta ON ta.id = cd.trading_account_id WHERE cd.id = ? LIMIT 1",
    ).bind(claims.deviceId).first<DeviceRow>();
    if (!device || device.revoked_at || device.trading_account_id !== claims.accountId) {
      return jsonError(401, "connector_revoked", "This connector is unknown or revoked.", correlationId);
    }

    const duplicate = await database.prepare("SELECT id FROM trade_events WHERE connector_device_id = ? AND idempotency_key = ? LIMIT 1")
      .bind(claims.deviceId, envelope.idempotencyKey).first<{ id: string }>();
    if (duplicate) return Response.json({ accepted: true, duplicate: true, sequence: envelope.sequence });
    if (envelope.sequence <= device.last_sequence) {
      return jsonError(409, "sequence_out_of_order", "The connector sequence is older than the last accepted event. Reconciliation is required.", correlationId);
    }

    const nowIso = new Date().toISOString();
    const eventId = `evt_${crypto.randomUUID().replace(/-/g, "")}`;
    const envelopeJson = canonicalStringify(envelope);
    const eventHash = await sha256Hex(envelopeJson);
    const previousAudit = await database.prepare("SELECT event_hash FROM audit_events WHERE organization_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1")
      .bind(device.organization_id).first<{ event_hash: string }>();
    const statements: AppPreparedStatement[] = [
      database.prepare("INSERT INTO trade_events (id, trading_account_id, connector_device_id, idempotency_key, sequence, event_type, occurred_at, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(eventId, claims.accountId, claims.deviceId, envelope.idempotencyKey, envelope.sequence, envelope.eventType, envelope.occurredAt, JSON.stringify(envelope.payload), nowIso, nowIso),
      database.prepare("UPDATE connector_devices SET last_sequence = ?, updated_at = ? WHERE id = ? AND last_sequence < ?")
        .bind(envelope.sequence, nowIso, claims.deviceId, envelope.sequence),
      database.prepare("INSERT INTO audit_events (id, organization_id, trading_account_id, actor_type, actor_id, event_type, occurred_at, correlation_id, payload_json, previous_hash, event_hash) VALUES (?, ?, ?, 'connector', ?, ?, ?, ?, ?, ?, ?)")
        .bind(`audit_${crypto.randomUUID().replace(/-/g, "")}`, device.organization_id, claims.accountId, claims.deviceId, `connector.${envelope.eventType}`, envelope.occurredAt, correlationId, JSON.stringify({ sequence: envelope.sequence, idempotencyKey: envelope.idempotencyKey }), previousAudit?.event_hash ?? null, eventHash),
    ];

    if (envelope.eventType === "account.snapshot" || envelope.eventType === "reconciliation") {
      const account = parseSnapshotAccount(envelope.payload.account);
      statements.push(
        database.prepare("INSERT INTO account_snapshots (id, trading_account_id, connector_device_id, sequence, observed_at, balance_minor, equity_minor, margin_minor, free_margin_minor, floating_pnl_minor, server_time, raw_payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(`snap_${crypto.randomUUID().replace(/-/g, "")}`, claims.accountId, claims.deviceId, envelope.sequence, envelope.occurredAt, account.balanceMinor, account.equityMinor, account.marginMinor, account.freeMarginMinor, account.floatingPnlMinor, account.serverTime, JSON.stringify(envelope.payload), nowIso, nowIso),
        database.prepare("UPDATE account_connections SET state = 'live', last_heartbeat_at = ?, last_snapshot_at = ?, connector_version = COALESCE(connector_version, 'unknown'), updated_at = ? WHERE trading_account_id = ?")
          .bind(nowIso, envelope.occurredAt, nowIso, claims.accountId),
      );
      statements.push(...await positionStatements(database, claims.accountId, envelope.payload.positions, nowIso));
    } else if (envelope.eventType === "heartbeat") {
      statements.push(database.prepare("UPDATE account_connections SET state = 'live', last_heartbeat_at = ?, updated_at = ? WHERE trading_account_id = ?")
        .bind(envelope.occurredAt, nowIso, claims.accountId));
    } else {
      statements.push(database.prepare("UPDATE account_connections SET state = 'live', last_heartbeat_at = ?, last_trade_event_at = ?, updated_at = ? WHERE trading_account_id = ?")
        .bind(nowIso, envelope.occurredAt, nowIso, claims.accountId));
    }

    await database.batch(statements);
    return Response.json({ accepted: true, duplicate: false, sequence: envelope.sequence, eventId }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error && !/binding|secret|database/i.test(error.message)
      ? error.message
      : "The connector event could not be accepted.";
    return jsonError(400, "event_rejected", message, correlationId);
  }
}

function parseSnapshotAccount(value: unknown): SnapshotAccount {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Snapshot account payload is required.");
  const record = value as Record<string, unknown>;
  const monetaryFields = ["balanceMinor", "equityMinor", "marginMinor", "freeMarginMinor", "floatingPnlMinor"] as const;
  for (const field of monetaryFields) if (!isCanonicalMinorUnits(record[field])) throw new Error(`Snapshot ${field} must be integer minor units.`);
  if (typeof record.serverTime !== "string" || !/^\d{10,13}$/.test(record.serverTime)) throw new Error("Snapshot serverTime must be Unix time as an integer string.");
  return record as SnapshotAccount;
}

async function positionStatements(database: AppDatabase, accountId: string, value: unknown, nowIso: string): Promise<AppPreparedStatement[]> {
  if (!Array.isArray(value)) throw new Error("Snapshot positions must be an array.");
  if (value.length > 100) throw new Error("Snapshot position limit exceeded.");
  const statements: AppPreparedStatement[] = [];
  const activeTickets: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Position payload is invalid.");
    const position = item as Record<string, unknown>;
    const ticket = requiredText(position.ticket, "ticket", 40);
    const symbol = requiredText(position.symbol, "symbol", 24);
    const direction = position.direction === "buy" || position.direction === "sell" ? position.direction : null;
    if (!direction) throw new Error("Position direction is invalid.");
    for (const field of ["volumeUnits", "openPricePoints", "currentPricePoints", "floatingPnlMinor"] as const) {
      if (!isCanonicalMinorUnits(position[field])) throw new Error(`Position ${field} must be integer units.`);
    }
    if (position.stopLossPricePoints !== null && !isCanonicalMinorUnits(position.stopLossPricePoints)) throw new Error("Position stopLossPricePoints is invalid.");
    if (position.takeProfitPricePoints !== null && !isCanonicalMinorUnits(position.takeProfitPricePoints)) throw new Error("Position takeProfitPricePoints is invalid.");
    const openedAt = requiredIso(position.openedAt, "openedAt");
    const id = await stableId("pos", `${accountId}:${ticket}`);
    activeTickets.push(ticket);
    statements.push(database.prepare("INSERT INTO positions (id, trading_account_id, ticket, symbol, direction, volume_units, open_price_points, current_price_points, stop_loss_price_points, take_profit_price_points, floating_pnl_minor, opened_at, closed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(trading_account_id, ticket) DO UPDATE SET symbol = excluded.symbol, direction = excluded.direction, volume_units = excluded.volume_units, current_price_points = excluded.current_price_points, stop_loss_price_points = excluded.stop_loss_price_points, take_profit_price_points = excluded.take_profit_price_points, floating_pnl_minor = excluded.floating_pnl_minor, closed_at = NULL, updated_at = excluded.updated_at")
      .bind(id, accountId, ticket, symbol, direction, position.volumeUnits, position.openPricePoints, position.currentPricePoints, position.stopLossPricePoints, position.takeProfitPricePoints, position.floatingPnlMinor, openedAt, nowIso, nowIso));
  }
  if (activeTickets.length === 0) {
    statements.push(database.prepare("UPDATE positions SET closed_at = COALESCE(closed_at, ?), updated_at = ? WHERE trading_account_id = ? AND closed_at IS NULL")
      .bind(nowIso, nowIso, accountId));
  } else {
    const placeholders = activeTickets.map(() => "?").join(",");
    statements.push(database.prepare(`UPDATE positions SET closed_at = COALESCE(closed_at, ?), updated_at = ? WHERE trading_account_id = ? AND closed_at IS NULL AND ticket NOT IN (${placeholders})`)
      .bind(nowIso, nowIso, accountId, ...activeTickets));
  }
  return statements;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`Position ${field} is invalid.`);
  return value.trim();
}

function requiredIso(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`Position ${field} is invalid.`);
  return value;
}
