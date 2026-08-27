import test from "node:test";
import assert from "node:assert/strict";
import type { Home, HomeItem, Routine, TaskOccurrence } from "../packages/contracts/src/index.ts";
import {
  InMemoryHomeItemRepository,
  InMemoryHomeRepository,
  InMemoryRoutineRepository,
  InMemoryTaskOccurrenceRepository
} from "../apps/api/src/persistence/in-memory-repositories.ts";

async function loadService() {
  return import("../apps/api/src/occurrences/occurrence-service.ts");
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
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z"
};

const item: HomeItem = {
  id: "item-1",
  homeId: home.id,
  name: "공기청정기",
  category: "APPLIANCE",
  replacementIntervalDays: 180,
  inspectionIntervalDays: 30,
  nextActionAt: "2026-08-27T11:00:00.000Z",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z"
};

const routineOccurrence: TaskOccurrence = {
  id: "occ-routine",
  homeId: home.id,
  sourceType: "ROUTINE",
  sourceId: routine.id,
  title: routine.title,
  dueAt: routine.nextDueAt,
  status: "PENDING"
};

const itemOccurrence: TaskOccurrence = {
  id: "occ-item",
  homeId: home.id,
  sourceType: "HOME_ITEM",
  sourceId: item.id,
  title: "공기청정기 점검",
  dueAt: item.nextActionAt!,
  status: "PENDING"
};

async function setup() {
  const homes = new InMemoryHomeRepository();
  const routines = new InMemoryRoutineRepository();
  const items = new InMemoryHomeItemRepository();
  const occurrences = new InMemoryTaskOccurrenceRepository();
  await homes.save(home);
  await routines.save(routine);
  await items.save(item);
  await occurrences.save(routineOccurrence);
  await occurrences.save(itemOccurrence);
  const { OccurrenceService } = await loadService();
  const service = new OccurrenceService({
    homes,
    routines,
    items,
    occurrences,
    now: () => new Date("2026-08-27T12:00:00.000Z")
  });
  return { service, routines, items, occurrences };
}

test("completing a routine occurrence is idempotent and advances the next due date once", async () => {
  const { service, routines } = await setup();

  const first = await service.complete("user-1", routineOccurrence.id);
  const second = await service.complete("user-1", routineOccurrence.id);

  assert.equal(first.status, "DONE");
  assert.equal(first.completedAt, "2026-08-27T12:00:00.000Z");
  assert.deepEqual(second, first);
  assert.equal((await routines.findById(routine.id))!.nextDueAt, "2026-09-03T09:00:00.000Z");
});

test("completing an item occurrence advances by its shortest maintenance interval", async () => {
  const { service, items } = await setup();
  await service.complete("user-1", itemOccurrence.id);
  assert.equal((await items.findById(item.id))!.nextActionAt, "2026-09-26T11:00:00.000Z");
});

test("undo returns occurrence to pending and rewinds schedule when this completion advanced it", async () => {
  const { service, routines } = await setup();
  await service.complete("user-1", routineOccurrence.id);

  const undone = await service.undo("user-1", routineOccurrence.id);

  assert.equal(undone.status, "PENDING");
  assert.equal(undone.completedAt, undefined);
  assert.equal((await routines.findById(routine.id))!.nextDueAt, routineOccurrence.dueAt);
});

test("history is owner-scoped and returns completed occurrences newest first", async () => {
  const { service, occurrences } = await setup();
  await occurrences.save({
    ...routineOccurrence,
    id: "done-old",
    status: "DONE",
    completedAt: "2026-08-26T12:00:00.000Z"
  });
  await occurrences.save({
    ...itemOccurrence,
    id: "done-new",
    status: "DONE",
    completedAt: "2026-08-27T13:00:00.000Z"
  });

  const history = await service.listHistory("user-1", home.id, 10);
  assert.deepEqual(history.map((entry: TaskOccurrence) => entry.id), ["done-new", "done-old"]);
  await assert.rejects(() => service.listHistory("user-2", home.id, 10), /Resource not found/);
});

test("cross-user completion is hidden as not found", async () => {
  const { service } = await setup();
  await assert.rejects(() => service.complete("user-2", routineOccurrence.id), /Resource not found/);
});
