import test from "node:test";
import assert from "node:assert/strict";
import type { Home, HomeItem, Routine, TaskOccurrence } from "../packages/contracts/src/index.ts";

async function loadRepositories() {
  return import("../apps/api/src/persistence/in-memory-repositories.ts");
}

const home: Home = {
  id: "home-1",
  ownerId: "user-1",
  name: "우리 집",
  regionCode: "2920011400",
  sido: "광주광역시",
  sigungu: "광산구",
  eupmyeondong: "수완동",
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z"
};

const routine: Routine = {
  id: "routine-1",
  homeId: home.id,
  title: "화장실 청소",
  category: "BATHROOM",
  recurrence: { type: "WEEKLY", interval: 1, weekdays: [4] },
  nextDueAt: "2026-08-27T09:00:00.000Z",
  isActive: true,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z"
};

const item: HomeItem = {
  id: "item-1",
  homeId: home.id,
  name: "정수기 필터",
  category: "FILTER",
  replacementIntervalDays: 90,
  nextActionAt: "2026-08-28T09:00:00.000Z",
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z"
};

test("in-memory repositories save, find, list and delete home-scoped records", async () => {
  const {
    InMemoryHomeRepository,
    InMemoryRoutineRepository,
    InMemoryHomeItemRepository
  } = await loadRepositories();

  const homes = new InMemoryHomeRepository();
  const routines = new InMemoryRoutineRepository();
  const items = new InMemoryHomeItemRepository();

  await homes.save(home);
  await routines.save(routine);
  await items.save(item);

  assert.deepEqual(await homes.findById(home.id), home);
  assert.deepEqual(await routines.listByHomeId(home.id), [routine]);
  assert.deepEqual(await items.listByHomeId(home.id), [item]);

  await routines.deleteById(routine.id);
  await items.deleteById(item.id);

  assert.equal(await routines.findById(routine.id), null);
  assert.equal(await items.findById(item.id), null);
});

test("occurrence history returns only completed records newest first", async () => {
  const { InMemoryTaskOccurrenceRepository } = await loadRepositories();
  const repository = new InMemoryTaskOccurrenceRepository();

  const occurrences: TaskOccurrence[] = [
    {
      id: "pending",
      homeId: home.id,
      sourceType: "ROUTINE",
      sourceId: "routine-1",
      title: "화장실 청소",
      dueAt: "2026-08-27T09:00:00.000Z",
      status: "PENDING"
    },
    {
      id: "done-old",
      homeId: home.id,
      sourceType: "HOME_ITEM",
      sourceId: "item-1",
      title: "필터 교체",
      dueAt: "2026-08-26T09:00:00.000Z",
      status: "DONE",
      completedAt: "2026-08-26T10:00:00.000Z"
    },
    {
      id: "done-new",
      homeId: home.id,
      sourceType: "WASTE",
      sourceId: "waste-1",
      title: "재활용품 배출",
      dueAt: "2026-08-27T11:00:00.000Z",
      status: "DONE",
      completedAt: "2026-08-27T12:00:00.000Z"
    }
  ];

  for (const occurrence of occurrences) await repository.save(occurrence);

  assert.deepEqual(
    (await repository.listCompletedByHomeId(home.id, 10)).map((entry: TaskOccurrence) => entry.id),
    ["done-new", "done-old"]
  );
});
