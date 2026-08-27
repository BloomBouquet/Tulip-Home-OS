import test from "node:test";
import assert from "node:assert/strict";
import type { TaskOccurrence } from "../packages/contracts/src/index.ts";
import {
  PostgresTaskOccurrenceRepository,
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

const pending: TaskOccurrence = {
  id: "occ-pending",
  homeId: "home-1",
  sourceType: "ROUTINE",
  sourceId: "routine-1",
  title: "화장실 청소",
  dueAt: "2026-08-28T09:00:00.000Z",
  status: "PENDING"
};

const done: TaskOccurrence = {
  ...pending,
  id: "occ-done",
  status: "DONE",
  completedAt: "2026-08-28T10:00:00.000Z"
};

function rowFromOccurrence(value: TaskOccurrence): Record<string, unknown> {
  return {
    id: value.id,
    home_id: value.homeId,
    source_type: value.sourceType,
    source_id: value.sourceId,
    title: value.title,
    due_at: new Date(value.dueAt),
    status: value.status,
    completed_at: value.completedAt ? new Date(value.completedAt) : null
  };
}

test("PostgresTaskOccurrenceRepository maps pending rows without completedAt and lists deterministically", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresTaskOccurrenceRepository(sql);
  sql.queue([rowFromOccurrence(pending)]);
  sql.queue([rowFromOccurrence(pending)]);

  assert.deepEqual(await repository.findById(pending.id), pending);
  assert.deepEqual(await repository.listByHomeId(pending.homeId), [pending]);
  assert.match(sql.calls[1].text, /ORDER BY due_at ASC, id ASC/i);
});

test("PostgresTaskOccurrenceRepository queries completed history newest-first with parameterized limit", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresTaskOccurrenceRepository(sql);
  sql.queue([rowFromOccurrence(done)]);

  assert.deepEqual(await repository.listCompletedByHomeId(done.homeId, 25), [done]);
  assert.match(sql.calls[0].text, /status = 'DONE'/i);
  assert.match(sql.calls[0].text, /completed_at IS NOT NULL/i);
  assert.match(sql.calls[0].text, /ORDER BY completed_at DESC, id ASC/i);
  assert.match(sql.calls[0].text, /LIMIT \$2/i);
  assert.deepEqual(sql.calls[0].params, [done.homeId, 25]);
});

test("PostgresTaskOccurrenceRepository upserts completedAt as a parameter", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresTaskOccurrenceRepository(sql);

  await repository.save(pending);
  await repository.save(done);

  assert.match(sql.calls[0].text, /INSERT INTO task_occurrences/i);
  assert.match(sql.calls[0].text, /ON CONFLICT/i);
  assert.deepEqual(sql.calls[0].params, [
    pending.id,
    pending.homeId,
    pending.sourceType,
    pending.sourceId,
    pending.title,
    pending.dueAt,
    pending.status,
    null
  ]);
  assert.equal(sql.calls[1].params[7], done.completedAt);
});
