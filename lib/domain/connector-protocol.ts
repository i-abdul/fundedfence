import { constantTimeEqual } from "./pairing.ts";

export const CONNECTOR_PROTOCOL_VERSION = "1.1";

export type ConnectorEventType = "account.snapshot" | "trade.transaction" | "heartbeat" | "reconciliation";

export type ConnectorEnvelope = {
  protocolVersion: typeof CONNECTOR_PROTOCOL_VERSION;
  connectorId: string;
  accountId: string;
  terminalIdentityHash: string;
  occurredAt: string;
  sentAt: string;
  sequence: number;
  idempotencyKey: string;
  eventType: ConnectorEventType;
  payload: Record<string, unknown>;
};

export type DeviceTokenClaims = {
  deviceId: string;
  accountId: string;
  tokenType: "access" | "refresh";
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export function validateEnvelope(value: unknown): ConnectorEnvelope {
  if (!value || typeof value !== "object") throw new Error("Envelope must be an object.");
  const envelope = value as Partial<ConnectorEnvelope>;
  if (envelope.protocolVersion !== CONNECTOR_PROTOCOL_VERSION) throw new Error("Unsupported protocol version.");
  if (!isIdentifier(envelope.connectorId) || !isIdentifier(envelope.accountId)) throw new Error("Invalid connector or account identifier.");
  if (typeof envelope.terminalIdentityHash !== "string" || !/^[a-f0-9]{64}$/.test(envelope.terminalIdentityHash)) {
    throw new Error("Invalid terminal identity hash.");
  }
  if (!Number.isSafeInteger(envelope.sequence) || Number(envelope.sequence) < 1) throw new Error("Sequence must be a positive safe integer.");
  if (!isIdentifier(envelope.idempotencyKey)) throw new Error("Invalid idempotency key.");
  if (!["account.snapshot", "trade.transaction", "heartbeat", "reconciliation"].includes(String(envelope.eventType))) {
    throw new Error("Unsupported event type.");
  }
  if (!envelope.occurredAt || Number.isNaN(Date.parse(envelope.occurredAt))) throw new Error("Invalid occurredAt timestamp.");
  if (!envelope.sentAt || Number.isNaN(Date.parse(envelope.sentAt))) throw new Error("Invalid sentAt timestamp.");
  const age = Math.abs(Date.now() - Date.parse(envelope.sentAt));
  if (age > 5 * 60 * 1000) throw new Error("Envelope timestamp is outside the accepted replay window.");
  if (!envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload)) throw new Error("Payload must be an object.");
  return envelope as ConnectorEnvelope;
}

export async function issueDeviceToken(claims: DeviceTokenClaims, secret: string): Promise<string> {
  const payload = base64UrlEncode(new TextEncoder().encode(canonicalStringify(claims)));
  return `${payload}.${await hmacHex(secret, payload)}`;
}

export async function verifyDeviceToken(token: string, secret: string): Promise<DeviceTokenClaims> {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) throw new Error("Malformed device token.");
  const expectedSignature = await hmacHex(secret, payload);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) throw new Error("Invalid device token.");
  const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as DeviceTokenClaims;
  if (!claims.deviceId || !claims.accountId || !["access", "refresh"].includes(claims.tokenType) || !claims.expiresAt || claims.expiresAt <= Date.now()) {
    throw new Error("Expired or invalid device token.");
  }
  return claims;
}

export async function signEnvelope(token: string, envelope: ConnectorEnvelope): Promise<string> {
  return hmacHex(token, canonicalStringify(envelope));
}

export async function verifyEnvelopeSignature(token: string, envelope: ConnectorEnvelope, signature: string): Promise<boolean> {
  return constantTimeEqual(await signEnvelope(token, envelope), signature.toLowerCase());
}

export async function signRawEnvelope(token: string, rawEnvelope: string): Promise<string> {
  return hmacHex(token, rawEnvelope);
}

export async function verifyRawEnvelopeSignature(token: string, rawEnvelope: string, signature: string): Promise<boolean> {
  return constantTimeEqual(await signRawEnvelope(token, rawEnvelope), signature.toLowerCase());
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",")}}`;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128 && /^[a-zA-Z0-9:_-]+$/.test(value);
}
