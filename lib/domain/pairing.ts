const PAIRING_CODE_PATTERN = /^\d{6}$/;
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

export type PairingCodeStatus = "active" | "used" | "expired";

export function normalizePairingCode(value: string): string {
  const normalized = value.replace(/[\s-]/g, "");
  if (!PAIRING_CODE_PATTERN.test(normalized)) {
    throw new Error("Pairing code must contain exactly six digits.");
  }
  return normalized;
}

export function generatePairingCode(randomBytes = crypto.getRandomValues(new Uint32Array(1))): string {
  return (randomBytes[0] % 1_000_000).toString().padStart(6, "0");
}

export function pairingCodeStatus(expiresAt: string, usedAt: string | null, now = Date.now()): PairingCodeStatus {
  if (usedAt) return "used";
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now ? "active" : "expired";
}

export async function hashPairingCode(code: string, pepper: string): Promise<string> {
  const normalized = normalizePairingCode(code);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`FundedFence:pairing:v1:${pepper}:${normalized}`),
  );
  return toHex(new Uint8Array(digest));
}

export function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
