import { Pool } from "pg";
import type { SqlExecutor, SqlQueryResult } from "./postgres-repositories.ts";

export interface PgPoolLike {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
}

export class PgPoolExecutor implements SqlExecutor {
  private readonly pool: PgPoolLike;

  constructor(pool: PgPoolLike) {
    this.pool = pool;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.pool.query<Row>(text, [...params]);
    return { rows: result.rows };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createPgPoolExecutor(): PgPoolExecutor;
export function createPgPoolExecutor(databaseUrl: string | undefined): PgPoolExecutor;
export function createPgPoolExecutor(databaseUrl?: string): PgPoolExecutor {
  const configuredUrl = arguments.length === 0 ? process.env.DATABASE_URL : databaseUrl;
  const connectionString = configuredUrl?.trim();
  if (!connectionString) throw new RangeError("DATABASE_URL is required");

  const pool = new Pool({ connectionString });
  const adapter: PgPoolLike = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: unknown[]
    ): Promise<{ rows: Row[] }> {
      const result = await pool.query(text, values);
      return { rows: result.rows as Row[] };
    },
    async end(): Promise<void> {
      await pool.end();
    }
  };

  return new PgPoolExecutor(adapter);
}
