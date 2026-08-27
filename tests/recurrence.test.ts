import test from "node:test";
import assert from "node:assert/strict";
import type { RecurrenceRule } from "../packages/contracts/src/index.ts";

async function loadCalculator() {
  try {
    const module = await import("../apps/api/src/routines/recurrence.ts");
    return module.calculateNextDueAt;
  } catch (error) {
    assert.fail(`recurrence implementation unavailable: ${String(error)}`);
  }
}

test("daily recurrence adds the configured interval", async () => {
  const calculateNextDueAt = await loadCalculator();
  const rule: RecurrenceRule = { type: "DAILY", interval: 2 };
  assert.equal(calculateNextDueAt(new Date("2026-08-27T09:00:00Z"), rule).toISOString(), "2026-08-29T09:00:00.000Z");
});

test("interval-days recurrence adds the configured number of days", async () => {
  const calculateNextDueAt = await loadCalculator();
  const rule: RecurrenceRule = { type: "INTERVAL_DAYS", interval: 14 };
  assert.equal(calculateNextDueAt(new Date("2026-08-27T09:00:00Z"), rule).toISOString(), "2026-09-10T09:00:00.000Z");
});

test("weekly recurrence selects the next configured weekday", async () => {
  const calculateNextDueAt = await loadCalculator();
  const rule: RecurrenceRule = { type: "WEEKLY", interval: 1, weekdays: [1, 4] };
  assert.equal(calculateNextDueAt(new Date("2026-08-27T09:00:00Z"), rule).toISOString(), "2026-08-31T09:00:00.000Z");
});

test("monthly recurrence clamps the day to the target month end", async () => {
  const calculateNextDueAt = await loadCalculator();
  const rule: RecurrenceRule = { type: "MONTHLY", interval: 1, day: 31 };
  assert.equal(calculateNextDueAt(new Date("2026-01-31T09:00:00Z"), rule).toISOString(), "2026-02-28T09:00:00.000Z");
});

test("recurrence rejects non-positive intervals", async () => {
  const calculateNextDueAt = await loadCalculator();
  assert.throws(
    () => calculateNextDueAt(new Date("2026-08-27T09:00:00Z"), { type: "DAILY", interval: 0 }),
    /positive integer/
  );
});

test("monthly recurrence rejects days outside 1 through 31", async () => {
  const calculateNextDueAt = await loadCalculator();
  assert.throws(
    () => calculateNextDueAt(new Date("2026-08-27T09:00:00Z"), { type: "MONTHLY", interval: 1, day: 0 }),
    /day from 1 through 31/
  );
});
