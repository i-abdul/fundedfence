import { d1Database, postgresDatabase, type AppDatabase } from "./database";

export type FundedFenceRuntimeEnv = {
  DB?: unknown;
  PAIRING_PEPPER?: string;
  CONNECTOR_TOKEN_SECRET?: string;
  APP_SESSION_SECRET?: string;
};

export async function getRuntimeEnv(): Promise<FundedFenceRuntimeEnv> {
  try {
    const runtime = await import("cloudflare:workers");
    return runtime.env as unknown as FundedFenceRuntimeEnv;
  } catch {
    return process.env as FundedFenceRuntimeEnv;
  }
}

export async function requireDatabase(): Promise<AppDatabase> {
  const database = (await getRuntimeEnv()).DB;
  if (database) return d1Database(database as Parameters<typeof d1Database>[0]);
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (url) return postgresDatabase(url);
  throw new Error("Database is unavailable. Configure DB or POSTGRES_URL.");
}

export async function requireSecret(name: "PAIRING_PEPPER" | "CONNECTOR_TOKEN_SECRET" | "APP_SESSION_SECRET"): Promise<string> {
  const value = (await getRuntimeEnv())[name];
  if (!value || value.length < 32) throw new Error(`${name} must be configured with at least 32 characters.`);
  return value;
}
