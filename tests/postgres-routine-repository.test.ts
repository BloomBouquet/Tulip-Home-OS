import test from "node:test";
import assert from "node:assert/strict";
import type { Routine } from "../packages/contracts/src/index.ts";
import {
  PostgresRoutineRepository,
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

const routine: Routine = {
  id: "routine-1",
  homeId: "home-1",
  title: "화장실 청소",
  category: "BATHROOM",
  recurrence: { type: "WEEKLY", interval: 1, weekdays: [2, 5] },
  nextDueAt: "2026-08-28T09:00:00.000Z",
  isActive: true,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z"
};

function rowFromRoutine(value: Routine): Record<string, unknown> {
  return {
    id: value.id,
    home_id: value.homeId,
    title: value.title,
    category: value.category,
    recurrence: value.recurrence,
    next_due_at: new Date(value.nextDueAt),
    is_active: value.isActive,
    created_at: new Date(value.createdAt),
    updated_at: new Date(value.updatedAt)
  };
}

test("PostgresRoutineRepository maps find/list rows and orders list deterministically", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresRoutineRepository(sql);
  sql.queue([rowFromRoutine(routine)]);
  sql.queue([rowFromRoutine(routine)]);

  assert.deepEqual(await repository.findById(routine.id), routine);
  assert.deepEqual(await repository.listByHomeId(routine.homeId), [routine]);
  assert.match(sql.calls[0].text, /WHERE id = \$1/i);
  assert.match(sql.calls[1].text, /ORDER BY next_due_at ASC, id ASC/i);
  assert.deepEqual(sql.calls[1].params, [routine.homeId]);
});

test("PostgresRoutineRepository upserts recurrence as a parameter and deletes by id", async () => {
  const sql = new RecordingSqlExecutor();
  const repository = new PostgresRoutineRepository(sql);

  await repository.save(routine);
  await repository.deleteById(routine.id);

  assert.match(sql.calls[0].text, /INSERT INTO routines/i);
  assert.match(sql.calls[0].text, /ON CONFLICT/i);
  assert.equal(sql.calls[0].params[4], routine.recurrence);
  assert.equal(sql.calls[0].text.includes(routine.title), false);
  assert.match(sql.calls[1].text, /DELETE FROM routines WHERE id = \$1/i);
  assert.deepEqual(sql.calls[1].params, [routine.id]);
});
