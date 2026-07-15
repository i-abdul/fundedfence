export type PropShieldRuntimeEnv = {
  DB?: D1Database;
  PAIRING_PEPPER?: string;
  CONNECTOR_TOKEN_SECRET?: string;
};

export async function getRuntimeEnv(): Promise<PropShieldRuntimeEnv> {
  const runtime = await import("cloudflare:workers");
  return runtime.env as unknown as PropShieldRuntimeEnv;
}

export async function requireDatabase(): Promise<D1Database> {
  const database = (await getRuntimeEnv()).DB;
  if (!database) throw new Error("Database binding DB is unavailable.");
  return database;
}

export async function requireSecret(name: "PAIRING_PEPPER" | "CONNECTOR_TOKEN_SECRET"): Promise<string> {
  const value = (await getRuntimeEnv())[name];
  if (!value || value.length < 32) throw new Error(`${name} must be configured with at least 32 characters.`);
  return value;
}
