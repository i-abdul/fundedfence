import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("POSTGRES_URL or DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  const sql = await readFile(join(process.cwd(), "deploy/postgres/001_initial.sql"), "utf8");
  await pool.query(sql);
  console.log("PostgreSQL migrations applied.");
} finally {
  await pool.end();
}
