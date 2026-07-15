import { Pool } from "pg";

export type RunResult = {
  success: boolean;
};

export interface AppPreparedStatement {
  bind(...values: unknown[]): AppPreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<RunResult>;
}

export interface AppDatabase {
  prepare(sql: string): AppPreparedStatement;
  batch(statements: AppPreparedStatement[]): Promise<RunResult[]>;
}

type D1LikeDatabase = {
  prepare(sql: string): AppPreparedStatement;
  batch(statements: AppPreparedStatement[]): Promise<RunResult[]>;
};

let pool: Pool | null = null;

export function d1Database(database: D1LikeDatabase): AppDatabase {
  return database;
}

export function postgresDatabase(connectionString: string): AppDatabase {
  pool ??= new Pool({ connectionString });
  return {
    prepare(sql: string) {
      return new PostgresPreparedStatement(sql, []);
    },
    async batch(statements: AppPreparedStatement[]) {
      const client = await pool!.connect();
      try {
        await client.query("BEGIN");
        const results: RunResult[] = [];
        for (const statement of statements) {
          if (!(statement instanceof PostgresPreparedStatement)) {
            throw new Error("Cannot mix database backends in one batch.");
          }
          await client.query(statement.postgresSql, statement.values);
          results.push({ success: true });
        }
        await client.query("COMMIT");
        return results;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

class PostgresPreparedStatement implements AppPreparedStatement {
  constructor(
    private readonly sql: string,
    readonly values: unknown[],
  ) {}

  get postgresSql(): string {
    return toPostgresSql(this.sql);
  }

  bind(...values: unknown[]): AppPreparedStatement {
    return new PostgresPreparedStatement(this.sql, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await pool!.query(this.postgresSql, this.values);
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    const result = await pool!.query(this.postgresSql, this.values);
    return { results: result.rows as T[] };
  }

  async run(): Promise<RunResult> {
    await pool!.query(this.postgresSql, this.values);
    return { success: true };
  }
}

function toPostgresSql(sql: string): string {
  let index = 0;
  const isInsertOrIgnore = /^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);
  const converted = sql
    .replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO")
    .replace(/\bMAX\(0,\s*attempts_remaining\s*-\s*1\)/gi, "GREATEST(0, attempts_remaining - 1)")
    .replace(/\?/g, () => `$${++index}`);
  if (isInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(converted)) return `${converted} ON CONFLICT DO NOTHING`;
  return converted;
}
