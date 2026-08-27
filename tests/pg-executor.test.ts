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

test("createPgPoolExecutor resolves DATABASE_URL at call time and rejects missing values", () => {
  assert.throws(() => createPgPoolExecutor(""), /DATABASE_URL is required/);
});
