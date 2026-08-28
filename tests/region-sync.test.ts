import assert from "node:assert/strict";
import test from "node:test";
import {
  MoisRegionApiClient,
  normalizeMoisRegionRow
} from "../apps/api/src/regions/mois-region-client.ts";
import { syncRegionCatalog } from "../apps/api/src/regions/region-sync-service.ts";
import type { RegionCatalogEntry } from "../apps/api/src/regions/region-catalog.ts";

const syncedAt = new Date("2026-08-28T00:00:00.000Z");

test("official legal-dong rows derive deterministic selector levels and exclude ri rows", () => {
  assert.deepEqual(
    normalizeMoisRegionRow({
      region_cd: "2900000000",
      sido_cd: "29",
      sgg_cd: "000",
      umd_cd: "000",
      ri_cd: "00",
      locatadd_nm: "광주광역시",
      locathigh_cd: "0000000000",
      locallow_nm: "광주광역시",
      adpt_de: "19880101"
    }, syncedAt),
    {
      regionCode: "2900000000",
      sido: "광주광역시",
      level: "SIDO",
      active: true,
      sourceUpdatedAt: "1988-01-01T00:00:00.000Z",
      syncedAt: syncedAt.toISOString()
    }
  );

  assert.deepEqual(
    normalizeMoisRegionRow({
      region_cd: "4111700000",
      sido_cd: "41",
      sgg_cd: "117",
      umd_cd: "000",
      ri_cd: "00",
      locatadd_nm: "경기도 수원시 영통구",
      locathigh_cd: "4100000000",
      locallow_nm: "수원시 영통구",
      adpt_de: "20031124"
    }, syncedAt),
    {
      regionCode: "4111700000",
      sido: "경기도",
      sigungu: "수원시 영통구",
      parentRegionCode: "4100000000",
      level: "SIGUNGU",
      active: true,
      sourceUpdatedAt: "2003-11-24T00:00:00.000Z",
      syncedAt: syncedAt.toISOString()
    }
  );

  assert.deepEqual(
    normalizeMoisRegionRow({
      region_cd: "4111710200",
      sido_cd: "41",
      sgg_cd: "117",
      umd_cd: "102",
      ri_cd: "00",
      locatadd_nm: "경기도 수원시 영통구 매탄동",
      locathigh_cd: "4111700000",
      locallow_nm: "매탄동",
      adpt_de: "19880423"
    }, syncedAt),
    {
      regionCode: "4111710200",
      sido: "경기도",
      sigungu: "수원시 영통구",
      locality: "매탄동",
      parentRegionCode: "4111700000",
      level: "EUPMYEONDONG",
      active: true,
      sourceUpdatedAt: "1988-04-23T00:00:00.000Z",
      syncedAt: syncedAt.toISOString()
    }
  );

  assert.equal(normalizeMoisRegionRow({
    region_cd: "4671025021",
    sido_cd: "46",
    sgg_cd: "710",
    umd_cd: "250",
    ri_cd: "21",
    locatadd_nm: "전라남도 담양군 담양읍 객사리",
    locathigh_cd: "4671025000",
    locallow_nm: "객사리",
    adpt_de: "19880423"
  }, syncedAt), null);
});

test("region API client paginates the MOIS StanReginCd JSON envelope with server credentials", async () => {
  const requested: URL[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requested.push(url);
    const page = Number(url.searchParams.get("pageNo"));
    const row = page === 1
      ? { region_cd: "2900000000", sido_cd: "29", sgg_cd: "000", umd_cd: "000", ri_cd: "00", locatadd_nm: "광주광역시", locathigh_cd: "0000000000", locallow_nm: "광주광역시", adpt_de: "19880101" }
      : { region_cd: "2920000000", sido_cd: "29", sgg_cd: "200", umd_cd: "000", ri_cd: "00", locatadd_nm: "광주광역시 광산구", locathigh_cd: "2900000000", locallow_nm: "광산구", adpt_de: "19880101" };
    return new Response(JSON.stringify({
      StanReginCd: [
        { head: [{ totalCount: 2 }] },
        { row: [row] }
      ]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = new MoisRegionApiClient({
    baseUrl: "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList",
    serviceKey: "server-secret",
    pageSize: 1,
    fetcher
  });
  const rows = await client.fetchAll();

  assert.equal(rows.length, 2);
  assert.equal(requested.length, 2);
  assert.equal(requested[0].searchParams.get("ServiceKey"), "server-secret");
  assert.equal(requested[0].searchParams.get("pageNo"), "1");
  assert.equal(requested[0].searchParams.get("numOfRows"), "1");
  assert.equal(requested[0].searchParams.get("type"), "json");
});

test("region sync stages the complete snapshot and publishes once", async () => {
  const rows = [
    { region_cd: "2900000000", sido_cd: "29", sgg_cd: "000", umd_cd: "000", ri_cd: "00", locatadd_nm: "광주광역시", locathigh_cd: "0000000000", locallow_nm: "광주광역시", adpt_de: "19880101" },
    { region_cd: "2920000000", sido_cd: "29", sgg_cd: "200", umd_cd: "000", ri_cd: "00", locatadd_nm: "광주광역시 광산구", locathigh_cd: "2900000000", locallow_nm: "광산구", adpt_de: "19880101" },
    { region_cd: "2920011400", sido_cd: "29", sgg_cd: "200", umd_cd: "114", ri_cd: "00", locatadd_nm: "광주광역시 광산구 수완동", locathigh_cd: "2920000000", locallow_nm: "수완동", adpt_de: "20030901" },
    { region_cd: "2920011421", sido_cd: "29", sgg_cd: "200", umd_cd: "114", ri_cd: "21", locatadd_nm: "광주광역시 광산구 수완동 가상리", locathigh_cd: "2920011400", locallow_nm: "가상리", adpt_de: "20030901" }
  ];
  let publications = 0;
  let published: RegionCatalogEntry[] = [];

  const result = await syncRegionCatalog({
    client: { fetchAll: async () => rows },
    catalog: {
      publishSnapshot: async (entries) => {
        publications += 1;
        published = entries;
      }
    },
    now: () => syncedAt
  });

  assert.deepEqual(result, { fetched: 4, accepted: 3, rejected: 1 });
  assert.equal(publications, 1);
  assert.equal(published.length, 3);
  assert.equal(published[2].regionCode, "2920011400");
});

test("region sync rejects an empty upstream snapshot without replacing the active catalog", async () => {
  let publications = 0;

  await assert.rejects(
    () => syncRegionCatalog({
      client: { fetchAll: async () => [] },
      catalog: {
        publishSnapshot: async () => {
          publications += 1;
        }
      },
      now: () => syncedAt
    }),
    /region snapshot is empty/
  );

  assert.equal(publications, 0);
});
