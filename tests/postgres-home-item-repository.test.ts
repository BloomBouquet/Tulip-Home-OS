import test from "node:test";
import assert from "node:assert/strict";
import type { HomeItem } from "../packages/contracts/src/index.ts";
import {
  PostgresHomeItemRepository,
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

const item: HomeItem = {
  id: "item-1",
  homeId: "home-1",
  name: "정수기 필터",
  category: "FILTER",
  purchasedAt: "2026-01-01T00:00:00.000Z",
  replacementIntervalDays: 90,
  nextActionAt: "2026-09-01T00:00:00.000Z",
  note: "주방",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z"
};

function rowFromItem(value: HomeItem): Record<string, unknown> {
  return {
    id: value.id,
    home_id: value.homeId,
    name: value.name,
    category: value.category,
    purchased_at: value.purchasedAt ? new Date(value.purchasedAt) : null,
    warranty_ends_at: value.warrantyEndsAt ? new Date(value.warrantyEndsAt) : null,
    replacement_interval_days: value.replacementIntervalDays ?? null,
    inspection_interval_days: value.inspectionIntervalDays ?? null,
    next_action_at: value.nextActionAt ? new Date(value.nextActionAt) : null,
    note: value.note ?? null,
    created_at: new Date(value.createdAt),
    updated_at: new Date(value.updatedAt)
  };
}

test("PostgresHomeItemRepository maps nullable columns without leaking nulls", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresHomeItemRepository(sql);
  sql.queue([rowFromItem(item)]);
  sql.queue([rowFromItem(item)]);

  assert.deepEqual(await repository.findById(item.id), item);
  assert.deepEqual(await repository.listByHomeId(item.homeId), [item]);
  assert.match(sql.calls[1].text, /ORDER BY next_action_at ASC NULLS LAST, id ASC/i);
});

test("PostgresHomeItemRepository upserts optional fields as parameters and deletes by id", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresHomeItemRepository(sql);

  await repository.save(item);
  await repository.deleteById(item.id);

  assert.match(sql.calls[0].text, /INSERT INTO home_items/i);
  assert.match(sql.calls[0].text, /ON CONFLICT/i);
  assert.deepEqual(sql.calls[0].params, [
    item.id,
    item.homeId,
    item.name,
    item.category,
    item.purchasedAt,
    null,
    item.replacementIntervalDays,
    null,
    item.nextActionAt,
    item.note,
    item.createdAt,
    item.updatedAt
  ]);
  assert.equal(sql.calls[0].text.includes(item.note ?? ""), false);
  assert.match(sql.calls[1].text, /DELETE FROM home_items WHERE id = \$1/i);
  assert.deepEqual(sql.calls[1].params, [item.id]);
});
