import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Home, HomeItem, Routine, TaskOccurrence } from "../packages/contracts/src/index.ts";
import {
  PostgresHomeItemRepository,
  PostgresHomeRepository,
  PostgresRoutineRepository,
  PostgresTaskOccurrenceRepository
} from "../apps/api/src/persistence/postgres-repositories.ts";
import { createPgPoolExecutor } from "../apps/api/src/persistence/pg-executor.ts";
import { PostgresRegionCatalog } from "../apps/api/src/regions/postgres-region-catalog.ts";
import { PostgresWasteSyncStore } from "../apps/api/src/waste/postgres-waste-sync-store.ts";
import { createTulipWebRuntime } from "../apps/web/src/server/tulip-runtime.ts";

const migrationUrls = [
  new URL("../apps/api/db/migrations/001_initial.sql", import.meta.url),
  new URL("../apps/api/db/migrations/002_unique_home_owner.sql", import.meta.url),
  new URL("../apps/api/db/migrations/003_persistent_auth_state.sql", import.meta.url),
  new URL("../apps/api/db/migrations/004_waste_data_sync.sql", import.meta.url)
];

function cookieValue(cookie: string | undefined, name: string): string | null {
  if (!cookie) return null;
  const [pair] = cookie.split(";");
  const [rawName, ...rawValue] = pair.split("=");
  if (rawName !== name || rawValue.length === 0) return null;
  return decodeURIComponent(rawValue.join("="));
}

test("PostgreSQL repositories persist Home OS data, public schedules, and authentication across runtimes", async () => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert.ok(databaseUrl, "DATABASE_URL is required for PostgreSQL integration tests");

  const sql = createPgPoolExecutor(databaseUrl);
  let runtimeA: ReturnType<typeof createTulipWebRuntime> | undefined;
  let runtimeB: ReturnType<typeof createTulipWebRuntime> | undefined;
  let runtimeC: ReturnType<typeof createTulipWebRuntime> | undefined;
  let runtimeD: ReturnType<typeof createTulipWebRuntime> | undefined;

  try {
    for (const migrationUrl of migrationUrls) {
      await sql.query(await readFile(migrationUrl, "utf8"));
    }

    const regions = new PostgresRegionCatalog(sql);
    await regions.publishSnapshot([
      {
        regionCode: "2900000000",
        sido: "광주광역시",
        level: "SIDO",
        active: true,
        sourceUpdatedAt: "2026-08-26T00:00:00.000Z",
        syncedAt: "2026-08-28T00:00:00.000Z"
      },
      {
        regionCode: "2920000000",
        sido: "광주광역시",
        sigungu: "광산구",
        parentRegionCode: "2900000000",
        level: "SIGUNGU",
        active: true,
        sourceUpdatedAt: "2026-08-26T00:00:00.000Z",
        syncedAt: "2026-08-28T00:00:00.000Z"
      },
      {
        regionCode: "2920011400",
        sido: "광주광역시",
        sigungu: "광산구",
        locality: "수완동",
        parentRegionCode: "2920000000",
        level: "EUPMYEONDONG",
        active: true,
        sourceUpdatedAt: "2026-08-26T00:00:00.000Z",
        syncedAt: "2026-08-28T00:00:00.000Z"
      }
    ]);

    const wasteStore = new PostgresWasteSyncStore(sql);
    const activeWasteSnapshot = [
      {
        id: "integration-waste-district",
        regionCode: "29200",
        wasteType: "GENERAL" as const,
        weekdays: [5],
        startTime: "20:00",
        methodDescription: "종량제 봉투",
        sourceUpdatedAt: "2026-08-26T00:00:00.000Z",
        sourceRowKey: "integration-source-district",
        sourceScopeName: "광산구 전체",
        syncedAt: "2026-08-28T00:00:00.000Z"
      },
      {
        id: "integration-waste-locality",
        regionCode: "2920011400",
        wasteType: "RECYCLING" as const,
        weekdays: [5],
        startTime: "21:00",
        methodDescription: "품목별 분리",
        sourceUpdatedAt: "2026-08-26T00:00:00.000Z",
        sourceRowKey: "integration-source-locality",
        sourceScopeName: "수완동",
        syncedAt: "2026-08-28T00:00:00.000Z"
      }
    ];
    await wasteStore.publishSnapshot([
      ...activeWasteSnapshot,
      {
        id: "integration-waste-stale",
        regionCode: "29200",
        wasteType: "FOOD",
        weekdays: [5],
        startTime: "19:00",
        methodDescription: "전용 용기",
        sourceUpdatedAt: "2026-08-25T00:00:00.000Z",
        sourceRowKey: "integration-source-stale",
        sourceScopeName: "광산구 전체",
        syncedAt: "2026-08-27T00:00:00.000Z"
      }
    ]);
    await wasteStore.publishSnapshot(activeWasteSnapshot);
    await wasteStore.publishSnapshot(activeWasteSnapshot);

    const wasteRows = await sql.query<{ id: string; active: boolean }>(
      "SELECT id, active FROM waste_schedules WHERE id LIKE 'integration-waste-%' ORDER BY id"
    );
    assert.deepEqual(wasteRows.rows, [
      { id: "integration-waste-district", active: true },
      { id: "integration-waste-locality", active: true },
      { id: "integration-waste-stale", active: false }
    ]);

    const homes = new PostgresHomeRepository(sql);
    const routines = new PostgresRoutineRepository(sql);
    const items = new PostgresHomeItemRepository(sql);
    const occurrences = new PostgresTaskOccurrenceRepository(sql);

    const home: Home = {
      id: "integration-home",
      ownerId: "integration-bouquet-user",
      name: "통합 테스트 집",
      regionCode: "2920011400",
      sido: "광주광역시",
      sigungu: "광산구",
      eupmyeondong: "수완동",
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z"
    };
    await homes.save(home);
    assert.deepEqual(await homes.findByOwnerId(home.ownerId), home);
    await assert.rejects(
      () => homes.save({ ...home, id: "integration-home-duplicate", name: "중복 집" }),
      (error: unknown) => {
        assert.ok(error instanceof RangeError);
        assert.equal(error.message, "Home already exists for this user");
        return true;
      }
    );

    const routine: Routine = {
      id: "integration-routine",
      homeId: home.id,
      title: "화장실 청소",
      category: "BATHROOM",
      recurrence: { type: "WEEKLY", interval: 1, weekdays: [5] },
      nextDueAt: "2026-08-28T09:00:00.000Z",
      isActive: true,
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z"
    };
    await routines.save(routine);
    assert.deepEqual(await routines.listByHomeId(home.id), [routine]);

    const item: HomeItem = {
      id: "integration-item",
      homeId: home.id,
      name: "정수기 필터",
      category: "FILTER",
      purchasedAt: "2026-08-01T00:00:00.000Z",
      replacementIntervalDays: 90,
      nextActionAt: "2026-10-30T00:00:00.000Z",
      note: "주방",
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z"
    };
    await items.save(item);
    assert.deepEqual(await items.findById(item.id), item);

    const occurrence: TaskOccurrence = {
      id: "integration-occurrence",
      homeId: home.id,
      sourceType: "ROUTINE",
      sourceId: routine.id,
      title: routine.title,
      dueAt: routine.nextDueAt,
      status: "DONE",
      completedAt: "2026-08-28T10:00:00.000Z"
    };
    await occurrences.save(occurrence);
    assert.deepEqual(await occurrences.findById(occurrence.id), occurrence);
    assert.deepEqual(await occurrences.listCompletedByHomeId(home.id, 10), [occurrence]);

    const runtimeEnv = {
      BOUQUET_AUTHORIZATION_URL: "https://auth.example/authorize",
      BOUQUET_TOKEN_URL: "https://auth.example/token",
      BOUQUET_USERINFO_URL: "https://auth.example/userinfo",
      BOUQUET_CLIENT_ID: "tulip",
      BOUQUET_REDIRECT_URI: "https://tulip.example/api/auth/bouquet/callback",
      TULIP_POST_LOGIN_URL: "/api/auth/post-login",
      DATABASE_URL: databaseUrl
    };
    const runtimeFetcher = async (url: string | URL, init?: RequestInit) => {
      if (String(url) === runtimeEnv.BOUQUET_TOKEN_URL) {
        const body = new URLSearchParams(String(init?.body ?? ""));
        return new Response(JSON.stringify({ access_token: `access-${body.get("code")}` }), { status: 200 });
      }
      if (String(url) === runtimeEnv.BOUQUET_USERINFO_URL) {
        return new Response(JSON.stringify({ sub: "runtime-bouquet-user", name: "Runtime User" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    runtimeA = createTulipWebRuntime(runtimeEnv, runtimeFetcher);
    const started = await runtimeA.sso.start("/api/auth/post-login");
    assert.equal(started.status, 302);
    const state = new URL(started.headers.Location).searchParams.get("state");
    assert.ok(state);
    const stateCookie = started.cookies?.find((value) => value.startsWith("tulip_oauth_state="));
    assert.ok(stateCookie);

    const persistedStates = await sql.query<{ state_hash: string }>(
      "SELECT state_hash FROM oauth_transient_states"
    );
    assert.equal(persistedStates.rows.length, 1);
    assert.match(persistedStates.rows[0].state_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(persistedStates.rows[0].state_hash, state);

    runtimeB = createTulipWebRuntime(runtimeEnv, runtimeFetcher);
    const callback = await runtimeB.sso.callback({
      code: "runtime-login",
      state,
      cookieHeader: stateCookie
    });
    assert.equal(callback.status, 302);
    const sessionCookie = callback.cookies?.find((value) => value.startsWith("tulip_session="));
    assert.ok(sessionCookie);
    const rawSessionToken = cookieValue(sessionCookie, "tulip_session");
    assert.ok(rawSessionToken);

    const remainingStates = await sql.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM oauth_transient_states"
    );
    assert.equal(remainingStates.rows[0].count, "0");

    const persistedSessions = await sql.query<{ token_hash: string }>(
      "SELECT token_hash FROM tulip_sessions WHERE user_id = $1",
      ["runtime-bouquet-user"]
    );
    assert.equal(persistedSessions.rows.length, 1);
    assert.match(persistedSessions.rows[0].token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(persistedSessions.rows[0].token_hash, rawSessionToken);

    const replay = await runtimeB.sso.callback({
      code: "runtime-login",
      state,
      cookieHeader: stateCookie
    });
    assert.equal(replay.status, 400);

    runtimeC = createTulipWebRuntime(runtimeEnv, runtimeFetcher);
    const me = await runtimeC.handleApi({ method: "GET", path: "/v1/me" }, sessionCookie);
    assert.equal(me.status, 200);
    assert.deepEqual(me.body, { userId: "runtime-bouquet-user", displayName: "Runtime User" });

    const regionResponse = await runtimeC.handleApi({ method: "GET", path: "/v1/regions/sido" }, sessionCookie);
    assert.equal(regionResponse.status, 200);
    assert.deepEqual(regionResponse.body, [{
      regionCode: "2900000000",
      name: "광주광역시",
      level: "SIDO",
      sido: "광주광역시"
    }]);

    const invalidHome = await runtimeC.handleApi({
      method: "POST",
      path: "/v1/homes",
      body: {
        name: "잘못된 런타임 집",
        regionCode: "2920011400",
        sido: "광주광역시",
        sigungu: "광산구",
        eupmyeondong: "다른동"
      }
    }, sessionCookie);
    assert.equal(invalidHome.status, 400);

    const created = await runtimeC.handleApi({
      method: "POST",
      path: "/v1/homes",
      body: {
        name: "런타임 영속 집",
        regionCode: "2920011400",
        sido: "광주광역시",
        sigungu: "광산구",
        eupmyeondong: "수완동"
      }
    }, sessionCookie);
    assert.equal(created.status, 201);

    const today = await runtimeC.handleApi({
      method: "GET",
      path: "/v1/today",
      query: { date: "2026-08-28" }
    }, sessionCookie);
    assert.equal(today.status, 200);
    const todayItems = (today.body as { items: TaskOccurrence[] }).items.filter((item) => item.sourceType === "WASTE");
    assert.deepEqual(todayItems.map((item) => item.sourceId), [
      "integration-waste-district",
      "integration-waste-locality"
    ]);

    runtimeD = createTulipWebRuntime(runtimeEnv, runtimeFetcher);
    const current = await runtimeD.handleApi({ method: "GET", path: "/v1/homes/current" }, sessionCookie);
    assert.equal(current.status, 200);
    assert.equal((current.body as Home).name, "런타임 영속 집");

    const logout = await runtimeD.sso.logout(sessionCookie);
    assert.equal(logout.status, 204);
    const rejected = await runtimeC.handleApi({ method: "GET", path: "/v1/me" }, sessionCookie);
    assert.equal(rejected.status, 401);
  } finally {
    await Promise.allSettled([
      runtimeA?.close() ?? Promise.resolve(),
      runtimeB?.close() ?? Promise.resolve(),
      runtimeC?.close() ?? Promise.resolve(),
      runtimeD?.close() ?? Promise.resolve()
    ]);
    await sql.close();
  }
});
