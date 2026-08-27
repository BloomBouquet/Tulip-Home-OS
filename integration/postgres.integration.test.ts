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
import { createTulipWebRuntime } from "../apps/web/src/server/tulip-runtime.ts";

const migrationUrl = new URL("../apps/api/db/migrations/001_initial.sql", import.meta.url);

async function createRuntimeSession(
  runtime: ReturnType<typeof createTulipWebRuntime>,
  userId: string
): Promise<string> {
  const started = await runtime.sso.start("/api/auth/post-login");
  const state = new URL(started.headers.Location).searchParams.get("state")!;
  const oauthCookie = started.cookies?.[0];
  const callback = await runtime.sso.callback({ code: userId, state, cookieHeader: oauthCookie });
  const cookie = callback.cookies?.find((value) => value.startsWith("tulip_session="));
  assert.ok(cookie, "Tulip session cookie should be created");
  return cookie;
}

test("PostgreSQL repositories persist and read the Home OS core flow", async () => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  assert.ok(databaseUrl, "DATABASE_URL is required for PostgreSQL integration tests");

  const sql = createPgPoolExecutor(databaseUrl);
  const migration = await readFile(migrationUrl, "utf8");
  await sql.query(migration);

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

  const runtimeA = createTulipWebRuntime(runtimeEnv, runtimeFetcher);
  const runtimeACookie = await createRuntimeSession(runtimeA, "runtime-a");
  const created = await runtimeA.handleApi({
    method: "POST",
    path: "/v1/homes",
    body: {
      name: "런타임 영속 집",
      regionCode: "2920011400",
      sido: "광주광역시",
      sigungu: "광산구",
      eupmyeondong: "수완동"
    }
  }, runtimeACookie);
  assert.equal(created.status, 201);

  const runtimeB = createTulipWebRuntime(runtimeEnv, runtimeFetcher);
  const runtimeBCookie = await createRuntimeSession(runtimeB, "runtime-b");
  const current = await runtimeB.handleApi({ method: "GET", path: "/v1/homes/current" }, runtimeBCookie);
  assert.equal(current.status, 200);
  assert.equal((current.body as Home).name, "런타임 영속 집");

  await (runtimeA as ReturnType<typeof createTulipWebRuntime> & { close?: () => Promise<void> }).close?.();
  await (runtimeB as ReturnType<typeof createTulipWebRuntime> & { close?: () => Promise<void> }).close?.();
  await sql.close();
});
