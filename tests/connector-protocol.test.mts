import assert from "node:assert/strict";
import test from "node:test";
import { issueDeviceToken, signEnvelope, signRawEnvelope, validateEnvelope, verifyDeviceToken, verifyEnvelopeSignature, verifyRawEnvelopeSignature, type ConnectorEnvelope } from "../lib/domain/connector-protocol.ts";

const secret = "connector-secret-for-tests-only-123456";

function envelope(overrides: Partial<ConnectorEnvelope> = {}): ConnectorEnvelope {
  return {
    protocolVersion: "1.0",
    connectorId: "dev_12345678",
    accountId: "acct_12345678",
    occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    sentAt: new Date().toISOString(),
    sequence: 7,
    idempotencyKey: "evt_12345678",
    eventType: "account.snapshot",
    payload: { account: { balanceMinor: "10000000" } },
    ...overrides,
  };
}

test("issues and verifies a scoped short-lived connector token", async () => {
  const now = Date.now();
  const token = await issueDeviceToken({ deviceId: "dev_12345678", accountId: "acct_12345678", tokenType: "access", issuedAt: now, expiresAt: now + 60_000, nonce: "nonce_12345678" }, secret);
  const claims = await verifyDeviceToken(token, secret);
  assert.equal(claims.deviceId, "dev_12345678");
  assert.equal(claims.tokenType, "access");
  await assert.rejects(() => verifyDeviceToken(`${token}x`, secret));
});

test("signs the canonical envelope and detects tampering", async () => {
  const value = envelope();
  const signature = await signEnvelope("device-access-token", value);
  assert.equal(await verifyEnvelopeSignature("device-access-token", value, signature), true);
  assert.equal(await verifyEnvelopeSignature("device-access-token", { ...value, sequence: 8 }, signature), false);
});

test("verifies raw connector JSON exactly as sent by MT5", async () => {
  const rawEnvelope = `{"accountId":"acct_12345678","connectorId":"dev_12345678","eventType":"account.snapshot","idempotencyKey":"evt_12345678","occurredAt":"${new Date().toISOString()}","payload":{"account":{"balanceMinor":"10000000","equityMinor":"10000000","marginMinor":"0","freeMarginMinor":"10000000","floatingPnlMinor":"0","serverTime":"2026.07.15 23:20:00"},"positions":[],"pendingOrderCount":0},"protocolVersion":"1.0","sentAt":"${new Date().toISOString()}","sequence":1}`;
  const signature = await signRawEnvelope("device-access-token", rawEnvelope);
  assert.equal(await verifyRawEnvelopeSignature("device-access-token", rawEnvelope, signature), true);
  assert.equal(await verifyRawEnvelopeSignature("device-access-token", rawEnvelope.replace('"sequence":1', '"sequence":2'), signature), false);
});

test("accepts buffered historical events while enforcing a fresh send timestamp", () => {
  assert.equal(validateEnvelope(envelope()).sequence, 7);
  assert.throws(() => validateEnvelope(envelope({ sentAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() })), /replay window/);
});
