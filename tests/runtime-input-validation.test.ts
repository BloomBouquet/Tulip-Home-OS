import test from "node:test";
import assert from "node:assert/strict";
import type { Home } from "../packages/contracts/src/index.ts";
import { calculateNextDueAt } from "../apps/api/src/routines/recurrence.ts";
import { RoutineService } from "../apps/api/src/routines/routine-service.ts";
import { HomeItemService } from "../apps/api/src/items/item-service.ts";
import { TulipApiRouter } from "../apps/api/src/http/tulip-api-router.ts";
import {
  InMemoryHomeItemRepository,
  InMemoryHomeRepository,
  InMemoryRoutineRepository
} from "../apps/api/src/persistence/in-memory-repositories.ts";

const home: Home = {
  id: "home-runtime",
  ownerId: "user-runtime",
  name: "우리 집",
  regionCode: "2920011400",
  sido: "광주광역시",
  sigungu: "광산구",
  eupmyeondong: "수완동",
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z"
};

test("recurrence rejects unsupported runtime rule types", () => {
  assert.throws(
    () => calculateNextDueAt(
      new Date("2026-08-27T09:00:00Z"),
      { type: "YEARLY", interval: 1 } as any
    ),
    /unsupported recurrence type/
  );
});

test("routine service rejects unsupported runtime categories", async () => {
  const homes = new InMemoryHomeRepository();
  const routines = new InMemoryRoutineRepository();
  await homes.save(home);
  const service = new RoutineService({
    homes,
    routines,
    now: () => new Date("2026-08-27T00:00:00Z"),
    createId: () => "routine-runtime"
  });

  await assert.rejects(
    () => service.create(home.ownerId, {
      homeId: home.id,
      title: "잘못된 카테고리",
      category: "INVALID" as any,
      recurrence: { type: "DAILY", interval: 1 },
      firstDueAt: "2026-08-27T09:00:00Z"
    }),
    /unsupported routine category/
  );
  assert.deepEqual(await routines.listByHomeId(home.id), []);
});

test("item service rejects unsupported runtime categories", async () => {
  const homes = new InMemoryHomeRepository();
  const items = new InMemoryHomeItemRepository();
  await homes.save(home);
  const service = new HomeItemService({
    homes,
    items,
    now: () => new Date("2026-08-27T00:00:00Z"),
    createId: () => "item-runtime"
  });

  await assert.rejects(
    () => service.create(home.ownerId, {
      homeId: home.id,
      name: "잘못된 품목",
      category: "INVALID" as any
    }),
    /unsupported item category/
  );
  assert.deepEqual(await items.listByHomeId(home.id), []);
});

test("malformed encoded resource paths map to 400 instead of 500", async () => {
  const router = new TulipApiRouter({
    auth: { verify: async () => ({ userId: "user-runtime" }) },
    homes: {} as any,
    routines: {} as any,
    items: {} as any,
    occurrences: {} as any,
    todaySource: {} as any
  });

  const response = await router.handle({
    method: "GET",
    path: "/v1/items/%E0%A4%A",
    headers: { authorization: "Bearer token" }
  });
  assert.equal(response.status, 400);
  assert.equal((response.body as any).error, "BAD_REQUEST");
});
