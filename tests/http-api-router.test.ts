import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryHomeItemRepository,
  InMemoryHomeRepository,
  InMemoryRoutineRepository,
  InMemoryTaskOccurrenceRepository
} from "../apps/api/src/persistence/in-memory-repositories.ts";
import { LocalBouquetAuthAdapter } from "../apps/api/src/auth/bouquet-auth-adapter.ts";
import { RoutineService } from "../apps/api/src/routines/routine-service.ts";
import { HomeItemService } from "../apps/api/src/items/item-service.ts";
import { OccurrenceService } from "../apps/api/src/occurrences/occurrence-service.ts";
import { RepositoryTodaySource } from "../apps/api/src/today/repository-today-source.ts";

async function setup() {
  const [{ HomeManagementService }, { TulipApiRouter }] = await Promise.all([
    import("../apps/api/src/home/home-management-service.ts"),
    import("../apps/api/src/http/tulip-api-router.ts")
  ]);

  const homes = new InMemoryHomeRepository();
  const routines = new InMemoryRoutineRepository();
  const items = new InMemoryHomeItemRepository();
  const occurrences = new InMemoryTaskOccurrenceRepository();
  let seq = 0;
  const createId = (prefix: string) => () => `${prefix}-${++seq}`;
  const now = () => new Date("2026-08-27T15:00:00.000Z");

  const homeService = new HomeManagementService({ homes, now, createId: createId("home") });
  const routineService = new RoutineService({ homes, routines, now, createId: createId("routine") });
  const itemService = new HomeItemService({ homes, items, now, createId: createId("item") });
  const occurrenceService = new OccurrenceService({ homes, routines, items, occurrences, now });
  const todaySource = new RepositoryTodaySource({
    routines,
    items,
    occurrences,
    waste: { getByRegionAndDate: async () => [] }
  });

  const router = new TulipApiRouter({
    auth: new LocalBouquetAuthAdapter(),
    homes: homeService,
    routines: routineService,
    items: itemService,
    occurrences: occurrenceService,
    todaySource
  });
  return { router };
}

const auth = { authorization: "Bearer owner-token" };

async function call(router: any, method: string, path: string, body?: unknown, query?: Record<string, string>) {
  return router.handle({ method, path, headers: auth, body, query });
}

test("API rejects requests without Bouquet bearer authentication", async () => {
  const { router } = await setup();
  const response = await router.handle({ method: "GET", path: "/v1/me", headers: {} });
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "UNAUTHORIZED" });
});

test("Home onboarding and current-home retrieval work through HTTP router", async () => {
  const { router } = await setup();
  const created = await call(router, "POST", "/v1/homes", {
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
  assert.equal(created.status, 201);

  const current = await call(router, "GET", "/v1/homes/current");
  assert.equal(current.status, 200);
  assert.equal((current.body as any).eupmyeondong, "수완동");
});

test("Routine CRUD and Today are exposed through authenticated routes", async () => {
  const { router } = await setup();
  await call(router, "POST", "/v1/homes", {
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
  const home = await call(router, "GET", "/v1/homes/current");
  const homeId = (home.body as any).id;

  const created = await call(router, "POST", "/v1/routines", {
    homeId,
    title: "화장실 청소",
    category: "BATHROOM",
    recurrence: { type: "DAILY", interval: 1 },
    firstDueAt: "2026-08-27T14:00:00.000Z"
  });
  assert.equal(created.status, 201);

  const list = await call(router, "GET", "/v1/routines", undefined, { homeId });
  assert.equal(list.status, 200);
  assert.equal((list.body as any[]).length, 1);

  const today = await call(router, "GET", "/v1/today", undefined, { date: "2026-08-28" });
  assert.equal(today.status, 200);
  assert.equal((today.body as any).items.length, 1);
});

test("invalid domain input maps to 400 and unknown routes map to 404", async () => {
  const { router } = await setup();
  const bad = await call(router, "POST", "/v1/homes", {
    name: "우리 집",
    regionCode: "",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
  assert.equal(bad.status, 400);
  assert.equal((bad.body as any).error, "BAD_REQUEST");

  const missing = await call(router, "GET", "/v1/unknown");
  assert.equal(missing.status, 404);
});

test("Routine update/delete and HomeItem CRUD are exposed through HTTP routes", async () => {
  const { router } = await setup();
  await call(router, "POST", "/v1/homes", {
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
  const homeId = ((await call(router, "GET", "/v1/homes/current")).body as any).id;

  const routine = await call(router, "POST", "/v1/routines", {
    homeId,
    title: "침구 세탁",
    category: "LAUNDRY",
    recurrence: { type: "INTERVAL_DAYS", interval: 14 },
    firstDueAt: "2026-08-28T01:00:00.000Z"
  });
  const routineId = (routine.body as any).id;
  const patchedRoutine = await call(router, "PATCH", `/v1/routines/${routineId}`, { title: "이불 세탁" });
  assert.equal(patchedRoutine.status, 200);
  assert.equal((patchedRoutine.body as any).title, "이불 세탁");
  assert.equal((await call(router, "DELETE", `/v1/routines/${routineId}`)).status, 204);

  const item = await call(router, "POST", "/v1/items", {
    homeId,
    name: "정수기 필터",
    category: "FILTER",
    purchasedAt: "2026-08-27T00:00:00.000Z",
    replacementIntervalDays: 90
  });
  assert.equal(item.status, 201);
  const itemId = (item.body as any).id;

  const items = await call(router, "GET", "/v1/items", undefined, { homeId });
  assert.equal(items.status, 200);
  assert.equal((items.body as any[]).length, 1);

  const patchedItem = await call(router, "PATCH", `/v1/items/${itemId}`, { note: "주방" });
  assert.equal(patchedItem.status, 200);
  assert.equal((patchedItem.body as any).note, "주방");
  assert.equal((await call(router, "DELETE", `/v1/items/${itemId}`)).status, 204);
});

test("occurrence complete, history, and undo routes preserve scheduling behavior", async () => {
  const { router } = await setup();
  await call(router, "POST", "/v1/homes", {
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
  const homeId = ((await call(router, "GET", "/v1/homes/current")).body as any).id;
  await call(router, "POST", "/v1/routines", {
    homeId,
    title: "환기하기",
    category: "ETC",
    recurrence: { type: "DAILY", interval: 1 },
    firstDueAt: "2026-08-27T14:00:00.000Z"
  });

  const today = await call(router, "GET", "/v1/today", undefined, { date: "2026-08-28" });
  const occurrenceId = (today.body as any).items[0].id;

  const completed = await call(router, "POST", `/v1/occurrences/${encodeURIComponent(occurrenceId)}/complete`);
  assert.equal(completed.status, 200);
  assert.equal((completed.body as any).status, "DONE");

  const history = await call(router, "GET", "/v1/history", undefined, { homeId, limit: "10" });
  assert.equal(history.status, 200);
  assert.equal((history.body as any[]).length, 1);

  const undone = await call(router, "POST", `/v1/occurrences/${encodeURIComponent(occurrenceId)}/undo`);
  assert.equal(undone.status, 200);
  assert.equal((undone.body as any).status, "PENDING");
});

test("item detail route is owner-scoped and invalid calendar date is rejected", async () => {
  const { router } = await setup();
  await call(router, "POST", "/v1/homes", {
    name: "우리 집",
    regionCode: "2920011400",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  });
  const homeId = ((await call(router, "GET", "/v1/homes/current")).body as any).id;
  const created = await call(router, "POST", "/v1/items", {
    homeId,
    name: "가습기 필터",
    category: "FILTER"
  });
  const itemId = (created.body as any).id;

  const detail = await call(router, "GET", `/v1/items/${itemId}`);
  assert.equal(detail.status, 200);
  assert.equal((detail.body as any).name, "가습기 필터");

  const invalidDate = await call(router, "GET", "/v1/today", undefined, { date: "2026-02-31" });
  assert.equal(invalidDate.status, 400);
});
