import test from "node:test";
import assert from "node:assert/strict";
import type { HomeItem, Routine, WasteSchedule } from "../packages/contracts/src/index.ts";
import {
  InMemoryHomeItemRepository,
  InMemoryRoutineRepository,
  InMemoryTaskOccurrenceRepository
} from "../apps/api/src/persistence/in-memory-repositories.ts";

async function loadSource() {
  return import("../apps/api/src/today/repository-today-source.ts");
}

const routine: Routine = {
  id: "routine-1",
  homeId: "home-1",
  title: "화장실 청소",
  category: "BATHROOM",
  recurrence: { type: "WEEKLY", interval: 1, weekdays: [4] },
  nextDueAt: "2026-08-27T00:30:00.000Z",
  isActive: true,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z"
};

const item: HomeItem = {
  id: "item-1",
  homeId: "home-1",
  name: "정수기 필터",
  category: "FILTER",
  replacementIntervalDays: 90,
  nextActionAt: "2026-08-27T02:00:00.000Z",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z"
};

const waste: WasteSchedule = {
  id: "29200:RECYCLING:4",
  regionCode: "29200",
  wasteType: "RECYCLING",
  weekdays: [4],
  startTime: "20:00",
  sourceUpdatedAt: "2026-08-20T00:00:00.000Z"
};

async function setup() {
  const routines = new InMemoryRoutineRepository();
  const items = new InMemoryHomeItemRepository();
  const occurrences = new InMemoryTaskOccurrenceRepository();
  await routines.save(routine);
  await items.save(item);
  const provider = {
    getByRegionAndDate: async () => [waste]
  };
  const { RepositoryTodaySource } = await loadSource();
  const source = new RepositoryTodaySource({ routines, items, occurrences, waste: provider });
  return { source, occurrences, routines };
}

test("repository source generates and materializes routine, item and waste occurrences", async () => {
  const { source, occurrences } = await setup();
  const date = new Date("2026-08-27T00:00:00.000Z");

  const routineOccurrences = await source.getRoutineOccurrences("home-1", date);
  const itemOccurrences = await source.getItemOccurrences("home-1", date);
  const wasteOccurrences = await source.getWasteOccurrences("29200", "home-1", date);

  assert.equal(routineOccurrences.length, 1);
  assert.equal(itemOccurrences.length, 1);
  assert.equal(wasteOccurrences.length, 1);
  assert.equal(wasteOccurrences[0].title, "재활용품 배출");
  assert.equal(wasteOccurrences[0].dueAt, "2026-08-27T11:00:00.000Z");

  const materialized = await occurrences.listByHomeId("home-1");
  assert.equal(materialized.length, 3);
  assert.ok(materialized.every((entry) => entry.status === "PENDING"));
});

test("repository source reuses persisted occurrence completion state", async () => {
  const { source, occurrences } = await setup();
  const date = new Date("2026-08-27T00:00:00.000Z");
  const [generated] = await source.getRoutineOccurrences("home-1", date);
  await occurrences.save({
    ...generated,
    status: "DONE",
    completedAt: "2026-08-27T03:00:00.000Z"
  });

  const [again] = await source.getRoutineOccurrences("home-1", date);
  assert.equal(again.status, "DONE");
  assert.equal(again.completedAt, "2026-08-27T03:00:00.000Z");
});

test("inactive routines and future item actions are not returned for the requested day", async () => {
  const { source, routines } = await setup();
  await routines.save({ ...routine, id: "routine-off", isActive: false });

  const routineOccurrences = await source.getRoutineOccurrences("home-1", new Date("2026-08-26T00:00:00.000Z"));
  const itemOccurrences = await source.getItemOccurrences("home-1", new Date("2026-08-26T00:00:00.000Z"));

  assert.deepEqual(routineOccurrences, []);
  assert.deepEqual(itemOccurrences, []);
});

test("waste occurrences are isolated per home even when schedule and due time match", async () => {
  const { source, occurrences } = await setup();
  const date = new Date("2026-08-27T00:00:00.000Z");

  const [homeOne] = await source.getWasteOccurrences("29200", "home-1", date);
  const [homeTwo] = await source.getWasteOccurrences("29200", "home-2", date);

  assert.notEqual(homeOne.id, homeTwo.id);
  assert.equal(homeOne.homeId, "home-1");
  assert.equal(homeTwo.homeId, "home-2");
  assert.equal((await occurrences.listByHomeId("home-1")).length, 1);
  assert.equal((await occurrences.listByHomeId("home-2")).length, 1);
});
