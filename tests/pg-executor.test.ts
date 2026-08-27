import test from "node:test";
import assert from "node:assert/strict";
import {
  PgPoolExecutor,
  createPgPoolExecutor,
  type PgPoolLike
} from "../apps/api/src/persistence/pg-executor.ts";

class FakePool implements PgPoolLike {
  readonly calls: Array<{ text: string; values?: unknown[] }> = [];
  ended = false;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: Row[] }> {
    this.calls.push({ text, values });
    return { rows: [{ value: 1 }] as Row[] };
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

test("PgPoolExecutor forwards parameterized queries and closes its pool", async () => {
  const pool = new FakePool();
  const executor = new PgPoolExecutor(pool);

  const result = await executor.query<{ value: number }>("SELECT $1::int AS value", [1]);
  assert.deepEqual(result.rows, [{ value: 1 }]);
  assert.deepEqual(pool.calls, [{ text: "SELECT $1::int AS value", values: [1] }]);

  await executor.close();
  assert.equal(pool.ended, true);
});

test("createPgPoolExecutor rejects an explicitly empty database URL", () => {
  assert.throws(() => createPgPoolExecutor(""), /DATABASE_URL is required/);
});

test("explicit undefined does not fall back to process DATABASE_URL", () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://process-env-should-not-win/example";
  try {
    assert.throws(() => createPgPoolExecutor(undefined), /DATABASE_URL is required/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
