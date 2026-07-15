export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function stableId(prefix: string, value: string): Promise<string> {
  return `${prefix}_${(await sha256Hex(value)).slice(0, 24)}`;
}
