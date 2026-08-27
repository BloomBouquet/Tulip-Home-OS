import test from "node:test";
import assert from "node:assert/strict";
import type { Home } from "../packages/contracts/src/index.ts";
import {
  InMemoryHomeRepository,
  InMemoryRoutineRepository
} from "../apps/api/src/persistence/in-memory-repositories.ts";

async function loadService() {
  return import("../apps/api/src/routines/routine-service.ts");
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

async function setup() {
  const homes = new InMemoryHomeRepository();
  const routines = new InMemoryRoutineRepository();
  await homes.save(home);
  const { RoutineService } = await loadService();
  const service = new RoutineService({
    homes,
    routines,
    now: () => new Date("2026-08-27T00:00:00.000Z"),
    createId: () => "routine-created"
  });
  return { service, routines };
}

test("owner can create and list a routine", async () => {
  const { service } = await setup();
  const created = await service.create("user-1", {
    homeId: home.id,
    title: "화장실 청소",
    category: "BATHROOM",
    recurrence: { type: "WEEKLY", interval: 1, weekdays: [4] },
    firstDueAt: "2026-08-27T09:00:00.000Z"
  });

  assert.equal(created.id, "routine-created");
  assert.equal(created.homeId, home.id);
  assert.equal(created.nextDueAt, "2026-08-27T09:00:00.000Z");
  assert.equal(created.isActive, true);
  assert.deepEqual(await service.list("user-1", home.id), [created]);
});

test("owner can update and delete a routine", async () => {
  const { service, routines } = await setup();
  await service.create("user-1", {
    homeId: home.id,
    title: "화장실 청소",
    category: "BATHROOM",
    recurrence: { type: "WEEKLY", interval: 1, weekdays: [4] },
    firstDueAt: "2026-08-27T09:00:00.000Z"
  });

  const updated = await service.update("user-1", "routine-created", {
    title: "욕실 청소",
    isActive: false
  });
  assert.equal(updated.title, "욕실 청소");
  assert.equal(updated.isActive, false);

  await service.delete("user-1", "routine-created");
  assert.equal(await routines.findById("routine-created"), null);
});

test("cross-user routine operations are hidden as not found", async () => {
  const { service } = await setup();
  await service.create("user-1", {
    homeId: home.id,
    title: "침구 세탁",
    category: "LAUNDRY",
    recurrence: { type: "INTERVAL_DAYS", interval: 14 },
    firstDueAt: "2026-08-28T09:00:00.000Z"
  });

  await assert.rejects(() => service.list("user-2", home.id), /Resource not found/);
  await assert.rejects(() => service.update("user-2", "routine-created", { title: "침입" }), /Resource not found/);
  await assert.rejects(() => service.delete("user-2", "routine-created"), /Resource not found/);
});

test("routine title must not be empty", async () => {
  const { service } = await setup();
  await assert.rejects(
    () => service.create("user-1", {
      homeId: home.id,
      title: "   ",
      category: "ETC",
      recurrence: { type: "DAILY", interval: 1 },
      firstDueAt: "2026-08-27T09:00:00.000Z"
    }),
    /title is required/
  );
});

test("routine service rejects invalid recurrence before persistence", async () => {
  const { service, routines } = await setup();
  await assert.rejects(
    () => service.create("user-1", {
      homeId: home.id,
      title: "잘못된 루틴",
      category: "ETC",
      recurrence: { type: "MONTHLY", interval: 1, day: 0 },
      firstDueAt: "2026-08-27T09:00:00.000Z"
    }),
    /day from 1 through 31/
  );
  assert.deepEqual(await routines.listByHomeId(home.id), []);
});
