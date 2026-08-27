import test from "node:test";
import assert from "node:assert/strict";
import type { TaskOccurrence } from "../packages/contracts/src/index.ts";

async function loadAggregator() {
  try {
    return await import("../apps/api/src/today/today-aggregator.ts");
  } catch (error) {
    assert.fail(`today aggregator unavailable: ${String(error)}`);
  }
}

const routine: TaskOccurrence = {
  id: "r1",
  homeId: "home-1",
  sourceType: "ROUTINE",
  sourceId: "routine-1",
  title: "화장실 청소",
  dueAt: "2026-08-27T09:00:00.000Z",
  status: "PENDING"
};

const item: TaskOccurrence = {
  id: "i1",
  homeId: "home-1",
  sourceType: "HOME_ITEM",
  sourceId: "item-1",
  title: "정수기 필터 확인",
  dueAt: "2026-08-26T09:00:00.000Z",
  status: "PENDING"
};

const waste: TaskOccurrence = {
  id: "w1",
  homeId: "home-1",
  sourceType: "WASTE",
  sourceId: "waste-1",
  title: "재활용품 배출",
  dueAt: "2026-08-27T11:00:00.000Z",
  status: "DONE",
  completedAt: "2026-08-27T10:00:00.000Z"
};

test("merges three sources and sorts earlier due items first", async () => {
  const { buildToday } = await loadAggregator();
  const result = await buildToday(
    { homeId: "home-1", regionCode: "2920011400", date: new Date("2026-08-27T00:00:00Z") },
    {
      getRoutineOccurrences: async () => [routine],
      getItemOccurrences: async () => [item],
      getWasteOccurrences: async () => [waste]
    }
  );
  assert.deepEqual(result.items.map((entry: TaskOccurrence) => entry.id), ["i1", "r1", "w1"]);
  assert.deepEqual(result.summary, { pending: 2, completed: 1 });
});

test("keeps routine and item data when waste lookup fails", async () => {
  const { buildToday } = await loadAggregator();
  const result = await buildToday(
    { homeId: "home-1", regionCode: "2920011400", date: new Date("2026-08-27T00:00:00Z") },
    {
      getRoutineOccurrences: async () => [routine],
      getItemOccurrences: async () => [item],
      getWasteOccurrences: async () => { throw new Error("upstream unavailable"); }
    }
  );
  assert.deepEqual(result.items.map((entry: TaskOccurrence) => entry.id), ["i1", "r1"]);
  assert.deepEqual(result.warnings, ["쓰레기 일정 정보를 불러오지 못했어요."]);
});

test("deduplicates identical source occurrences", async () => {
  const { buildToday } = await loadAggregator();
  const duplicate = { ...routine, id: "r2" };
  const result = await buildToday(
    { homeId: "home-1", regionCode: "2920011400", date: new Date("2026-08-27T00:00:00Z") },
    {
      getRoutineOccurrences: async () => [routine, duplicate],
      getItemOccurrences: async () => [],
      getWasteOccurrences: async () => []
    }
  );
  assert.equal(result.items.length, 1);
});

test("reports the Today date in Asia/Seoul instead of UTC", async () => {
  const { buildToday } = await loadAggregator();
  const result = await buildToday(
    { homeId: "home-1", regionCode: "2920011400", date: new Date("2026-08-26T15:00:00.000Z") },
    {
      getRoutineOccurrences: async () => [],
      getItemOccurrences: async () => [],
      getWasteOccurrences: async () => []
    }
  );
  assert.equal(result.date, "2026-08-27");
});
