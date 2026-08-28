import assert from "node:assert/strict";
import test from "node:test";
import { LocalBouquetAuthAdapter } from "../apps/api/src/auth/bouquet-auth-adapter.ts";
import { HomeManagementService } from "../apps/api/src/home/home-management-service.ts";
import { TulipApiRouter } from "../apps/api/src/http/tulip-api-router.ts";
import { HomeItemService } from "../apps/api/src/items/item-service.ts";
import { OccurrenceService } from "../apps/api/src/occurrences/occurrence-service.ts";
import {
  InMemoryHomeItemRepository,
  InMemoryHomeRepository,
  InMemoryRoutineRepository,
  InMemoryTaskOccurrenceRepository
} from "../apps/api/src/persistence/in-memory-repositories.ts";
import type { RegionCatalogEntry, RegionCatalogReader, RegionLevel } from "../apps/api/src/regions/region-catalog.ts";
import { RoutineService } from "../apps/api/src/routines/routine-service.ts";
import { RepositoryTodaySource } from "../apps/api/src/today/repository-today-source.ts";

const entries: RegionCatalogEntry[] = [
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
];

class StubRegionCatalog implements RegionCatalogReader {
  async findByCode(regionCode: string) {
    return entries.find((entry) => entry.regionCode === regionCode) ?? null;
  }

  async listSido() {
    return entries.filter((entry) => entry.level === "SIDO");
  }

  async listChildren(parentRegionCode: string, level: Exclude<RegionLevel, "SIDO">) {
    return entries.filter((entry) => entry.parentRegionCode === parentRegionCode && entry.level === level);
  }

  async findDistrictCandidates(sido: string | undefined, sigungu: string) {
    return entries.filter((entry) => entry.level === "SIGUNGU" && entry.sigungu === sigungu && (!sido || entry.sido === sido));
  }
}

async function setup() {
  const homes = new InMemoryHomeRepository();
  const routines = new InMemoryRoutineRepository();
  const items = new InMemoryHomeItemRepository();
  const occurrences = new InMemoryTaskOccurrenceRepository();
  const regions = new StubRegionCatalog();
  const now = () => new Date("2026-08-28T00:00:00.000Z");

  const homeService = new HomeManagementService({
    homes,
    now,
    createId: () => "home-1",
    regions
  } as any);
  const router = new TulipApiRouter({
    auth: new LocalBouquetAuthAdapter(),
    homes: homeService,
    routines: new RoutineService({ homes, routines, now, createId: () => "routine-1" }),
    items: new HomeItemService({ homes, items, now, createId: () => "item-1" }),
    occurrences: new OccurrenceService({ homes, routines, items, occurrences, now }),
    todaySource: new RepositoryTodaySource({
      routines,
      items,
      occurrences,
      waste: { getByRegionAndDate: async () => [] }
    }),
    regions
  } as any);

  return { router, homes };
}

const headers = { authorization: "Bearer region-owner" };

function call(router: TulipApiRouter, path: string, query?: Record<string, string>) {
  return router.handle({ method: "GET", path, headers, query });
}

test("authenticated region selector API exposes code-based hierarchy", async () => {
  const { router } = await setup();

  const sido = await call(router, "/v1/regions/sido");
  assert.equal(sido.status, 200);
  assert.deepEqual(sido.body, [{
    regionCode: "2900000000",
    name: "광주광역시",
    level: "SIDO",
    sido: "광주광역시"
  }]);

  const sigungu = await call(router, "/v1/regions/sigungu", { parentCode: "2900000000" });
  assert.equal(sigungu.status, 200);
  assert.deepEqual(sigungu.body, [{
    regionCode: "2920000000",
    name: "광산구",
    level: "SIGUNGU",
    sido: "광주광역시",
    sigungu: "광산구"
  }]);

  const localities = await call(router, "/v1/regions/localities", { parentCode: "2920000000" });
  assert.equal(localities.status, 200);
  assert.deepEqual(localities.body, [{
    regionCode: "2920011400",
    name: "수완동",
    level: "EUPMYEONDONG",
    sido: "광주광역시",
    sigungu: "광산구",
    eupmyeondong: "수완동"
  }]);

  const missingParent = await call(router, "/v1/regions/sigungu");
  assert.equal(missingParent.status, 400);
});

test("Home creation accepts only an active canonical locality whose display hierarchy matches", async () => {
  const { router, homes } = await setup();

  const invalid = await router.handle({
    method: "POST",
    path: "/v1/homes",
    headers,
    body: {
      name: "우리 집",
      regionCode: "2920011400",
      sido: "광주광역시",
      sigungu: "광산구",
      eupmyeondong: "첨단동"
    }
  });
  assert.equal(invalid.status, 400);
  assert.equal(await homes.findByOwnerId("region-owner"), null);

  const valid = await router.handle({
    method: "POST",
    path: "/v1/homes",
    headers,
    body: {
      name: "우리 집",
      regionCode: "2920011400",
      sido: "광주광역시",
      sigungu: "광산구",
      eupmyeondong: "수완동"
    }
  });
  assert.equal(valid.status, 201);
  assert.equal((valid.body as any).regionCode, "2920011400");
});
