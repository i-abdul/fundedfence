import assert from "node:assert/strict";
import test from "node:test";
import { constantTimeEqual, generatePairingCode, hashPairingCode, normalizePairingCode } from "../lib/domain/pairing.ts";

test("normalizes a human-entered six-digit code", () => {
  assert.equal(normalizePairingCode("123 456"), "123456");
  assert.equal(normalizePairingCode("123-456"), "123456");
  assert.throws(() => normalizePairingCode("12345"));
});

test("generates a fixed-width code from secure random input", () => {
  assert.equal(generatePairingCode(new Uint32Array([42])), "000042");
  assert.match(generatePairingCode(new Uint32Array([999999])), /^\d{6}$/);
});

test("hashes pairing codes with a deployment secret and compares safely", async () => {
  const first = await hashPairingCode("123456", "a".repeat(32));
  const same = await hashPairingCode("123 456", "a".repeat(32));
  const different = await hashPairingCode("123457", "a".repeat(32));
  assert.equal(first, same);
  assert.notEqual(first, different);
  assert.equal(constantTimeEqual(first, same), true);
  assert.equal(constantTimeEqual(first, different), false);
});
