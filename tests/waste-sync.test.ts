import assert from "node:assert/strict";
import test from "node:test";
import type { RegionCatalogEntry, RegionCatalogReader } from "../apps/api/src/regions/region-catalog.ts";
import {
  createWasteSourceRowKey,
  expandMoisWasteRow,
  resolveWasteRegion,
  syncWasteSchedules
} from "../apps/api/src/waste/waste-sync-service.ts";
import { PostgresWasteSyncStore } from "../apps/api/src/waste/postgres-waste-sync-store.ts";
import type { SqlExecutor, SqlQueryResult } from "../apps/api/src/persistence/postgres-repositories.ts";

const district: RegionCatalogEntry = {
  regionCode: "2920000000",
  sido: "광주광역시",
  sigungu: "광산구",
  parentRegionCode: "2900000000",
  level: "SIGUNGU",
  active: true,
  sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
  syncedAt: "2026-08-28T00:00:00.000Z"
};
const locality: RegionCatalogEntry = {
  regionCode: "2920011400",
  sido: "광주광역시",
  sigungu: "광산구",
  locality: "수완동",
  parentRegionCode: "2920000000",
  level: "EUPMYEONDONG",
  active: true,
  sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
  syncedAt: "2026-08-28T00:00:00.000Z"
};

function catalog(options: { ambiguous?: boolean } = {}): RegionCatalogReader {
  return {
    async findByCode() { return null; },
    async listSido() { return []; },
    async listChildren(parent, level) {
      return parent === district.regionCode && level === "EUPMYEONDONG" ? [locality] : [];
    },
    async findDistrictCandidates() {
      return options.ambiguous ? [district, { ...district, regionCode: "4120000000", sido: "경기도" }] : [district];
    }
  };
}

const officialRow = {
  CTPV_NM: "광주광역시",
  SGG_NM: "광산구",
  MNG_ZONE_NM: "광산구 생활폐기물 관리구역",
  MNG_ZONE_TRGT_RGN_NM: "수완동",
  EMSN_PLC: "지정 배출장소",
  LF_WST_EMSN_MTHD: "종량제 봉투",
  LF_WST_EMSN_DOW: "월,수,금",
  LF_WST_EMSN_BGNG_TM: "20:00",
  LF_WST_EMSN_END_TM: "24:00",
  FOD_WST_EMSN_MTHD: "전용 용기",
  FOD_WST_EMSN_DOW: "화,목",
  FOD_WST_EMSN_BGNG_TM: "20:00",
  FOD_WST_EMSN_END_TM: "24:00",
  RCYCL_EMSN_MTHD: "품목별 분리",
  RCYCL_EMSN_DOW: "수",
  RCYCL_EMSN_BGNG_TM: "20:00",
  RCYCL_EMSN_END_TM: "24:00",
  DAT_CRTR_YMD: "20260826"
};

test("one official household-waste row expands into independent general, food, and recycling candidates", () => {
  const expanded = expandMoisWasteRow(officialRow);
  assert.deepEqual(expanded.map((item) => item.wasteType), ["GENERAL", "FOOD", "RECYCLING"]);
  assert.equal(expanded[0].weekdays, "월,수,금");
  assert.equal(expanded[1].methodDescription, "전용 용기");
  assert.equal(expanded[2].placeDescription, "지정 배출장소");
  assert.equal(expanded[0].sourceUpdatedAt, "2026-08-26T00:00:00.000Z");
});

test("region resolution prefers exact locality, falls back to district, and rejects ambiguity", async () => {
  const [candidate] = expandMoisWasteRow(officialRow);
  assert.deepEqual(await resolveWasteRegion(candidate, catalog()), {
    regionCode: "2920011400",
    sourceScopeName: "수완동"
  });

  const districtOnly = { ...candidate, sourceScopeName: "광산구 전체" };
  assert.deepEqual(await resolveWasteRegion(districtOnly, catalog()), {
    regionCode: "29200",
    sourceScopeName: "광산구 전체"
  });

  assert.equal(await resolveWasteRegion(candidate, catalog({ ambiguous: true })), null);
});

test("source row key is deterministic and changes when collection instructions change", async () => {
  const [candidate] = expandMoisWasteRow(officialRow);
  const first = await createWasteSourceRowKey(candidate);
  const same = await createWasteSourceRowKey({ ...candidate });
  const changed = await createWasteSourceRowKey({ ...candidate, startTime: "21:00" });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("waste sync refuses publication above the unresolved/malformed threshold", async () => {
  let publications = 0;
  const rows = [officialRow, { ...officialRow, SGG_NM: "중복구", MNG_ZONE_TRGT_RGN_NM: "어딘가" }];
  const ambiguousCatalog: RegionCatalogReader = {
    ...catalog(),
    async findDistrictCandidates(_sido, sigungu) {
      if (sigungu === "중복구") return [district, { ...district, regionCode: "4120000000", sido: "경기도", sigungu: "중복구" }];
      return [district];
    }
  };

  const result = await syncWasteSchedules({
    client: { fetchAll: async () => rows },
    regions: ambiguousCatalog,
    store: { publishSnapshot: async () => { publications += 1; } },
    now: () => new Date("2026-08-28T00:00:00.000Z")
  });

  assert.equal(result.published, false);
  assert.ok(result.unresolved > 0);
  assert.equal(publications, 0);
});

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    return { rows: [] };
  }
}

test("waste snapshot store upserts imported rows and deactivates only stale imported rows in one statement", async () => {
  const sql = new RecordingSql();
  const store = new PostgresWasteSyncStore(sql);
  await store.publishSnapshot([]);
  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /jsonb_to_recordset/i);
  assert.match(sql.calls[0].text, /ON CONFLICT/i);
  assert.match(sql.calls[0].text, /source_row_key IS NOT NULL/i);
  assert.match(sql.calls[0].text, /active\s*=\s*FALSE/i);
});
