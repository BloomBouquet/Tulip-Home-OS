import test from "node:test";
import assert from "node:assert/strict";
import type { Home } from "../packages/contracts/src/index.ts";
import {
  PostgresHomeRepository,
  type SqlExecutor,
  type SqlQueryResult
} from "../apps/api/src/persistence/postgres-repositories.ts";

class RecordingSqlExecutor implements SqlExecutor {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  private readonly queuedResults: SqlQueryResult<Record<string, unknown>>[] = [];

  queue(rows: Record<string, unknown>[]): void {
    this.queuedResults.push({ rows });
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    return (this.queuedResults.shift() ?? { rows: [] }) as SqlQueryResult<Row>;
  }
}

const home: Home = {
  id: "home-1",
  ownerId: "bouquet-user-1",
  name: "우리 집",
  regionCode: "2920011400",
  sido: "광주광역시",
  sigungu: "광산구",
  eupmyeondong: "수완동",
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T01:00:00.000Z"
};

function rowFromHome(value: Home): Record<string, unknown> {
  return {
    id: value.id,
    owner_id: value.ownerId,
    name: value.name,
    region_code: value.regionCode,
    sido: value.sido,
    sigungu: value.sigungu,
    eupmyeondong: value.eupmyeondong,
    created_at: new Date(value.createdAt),
    updated_at: new Date(value.updatedAt)
  };
}

test("PostgresHomeRepository provisions canonical Bouquet user before upserting Home", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresHomeRepository(sql);

  await repository.save(home);

  assert.equal(sql.calls.length, 2);
  assert.match(sql.calls[0].text, /INSERT INTO users/i);
  assert.match(sql.calls[0].text, /ON CONFLICT/i);
  assert.deepEqual(sql.calls[0].params, [home.ownerId, home.ownerId]);
  assert.match(sql.calls[1].text, /INSERT INTO homes/i);
  assert.match(sql.calls[1].text, /ON CONFLICT/i);
  assert.deepEqual(sql.calls[1].params, [
    home.id,
    home.ownerId,
    home.name,
    home.regionCode,
    home.sido,
    home.sigungu,
    home.eupmyeondong,
    home.createdAt,
    home.updatedAt
  ]);
  assert.equal(sql.calls.some((call) => call.text.includes(home.name)), false);
});

test("PostgresHomeRepository maps PostgreSQL rows to Home contracts", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresHomeRepository(sql);
  sql.queue([rowFromHome(home)]);
  sql.queue([rowFromHome(home)]);

  assert.deepEqual(await repository.findById(home.id), home);
  assert.deepEqual(await repository.findByOwnerId(home.ownerId), home);

  assert.match(sql.calls[0].text, /WHERE id = \$1/i);
  assert.deepEqual(sql.calls[0].params, [home.id]);
  assert.match(sql.calls[1].text, /WHERE owner_id = \$1/i);
  assert.deepEqual(sql.calls[1].params, [home.ownerId]);
});

test("PostgresHomeRepository returns null for missing Home rows", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresHomeRepository(sql);

  assert.equal(await repository.findById("missing"), null);
});
