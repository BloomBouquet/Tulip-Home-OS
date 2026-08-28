import assert from "node:assert/strict";
import test from "node:test";
import type { SqlExecutor, SqlQueryResult } from "../apps/api/src/persistence/postgres-repositories.ts";
import {
  PostgresRegionCatalog,
  type RegionCatalogEntry
} from "../apps/api/src/regions/postgres-region-catalog.ts";

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  private readonly responses: Array<Record<string, unknown>[]>;

  constructor(responses: Array<Record<string, unknown>[]> = []) {
    this.responses = [...responses];
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    return { rows: (this.responses.shift() ?? []) as Row[] };
  }
}

const gwangju: RegionCatalogEntry = {
  regionCode: "2900000000",
  sido: "광주광역시",
  level: "SIDO",
  active: true,
  sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
  syncedAt: "2026-08-28T00:00:00.000Z"
};

const gwangsan: RegionCatalogEntry = {
  regionCode: "2920000000",
  sido: "광주광역시",
  sigungu: "광산구",
  parentRegionCode: "2900000000",
  level: "SIGUNGU",
  active: true,
  sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
  syncedAt: "2026-08-28T00:00:00.000Z"
};

const suwan: RegionCatalogEntry = {
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

test("region snapshot publication upserts incoming rows and deactivates only stale rows in one statement", async () => {
  const sql = new RecordingSql();
  const catalog = new PostgresRegionCatalog(sql);

  await catalog.publishSnapshot([gwangju, gwangsan, suwan]);

  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /jsonb_to_recordset/i);
  assert.match(sql.calls[0].text, /ON CONFLICT\s*\(region_code\)/i);
  assert.match(sql.calls[0].text, /active\s*=\s*FALSE/i);
  assert.equal(sql.calls[0].params.length, 1);
  const snapshot = JSON.parse(String(sql.calls[0].params[0]));
  assert.equal(snapshot.length, 3);
  assert.equal(snapshot[2].region_code, "2920011400");
});

test("region catalog readers return active rows with deterministic hierarchy ordering", async () => {
  const sql = new RecordingSql([
    [
      {
        region_code: "2900000000",
        sido: "광주광역시",
        sigungu: null,
        locality: null,
        parent_region_code: null,
        level: "SIDO",
        active: true,
        source_updated_at: "2026-01-01T00:00:00.000Z",
        synced_at: "2026-08-28T00:00:00.000Z"
      }
    ],
    [
      {
        region_code: "2920000000",
        sido: "광주광역시",
        sigungu: "광산구",
        locality: null,
        parent_region_code: "2900000000",
        level: "SIGUNGU",
        active: true,
        source_updated_at: "2026-01-01T00:00:00.000Z",
        synced_at: "2026-08-28T00:00:00.000Z"
      }
    ],
    [
      {
        region_code: "2920011400",
        sido: "광주광역시",
        sigungu: "광산구",
        locality: "수완동",
        parent_region_code: "2920000000",
        level: "EUPMYEONDONG",
        active: true,
        source_updated_at: "2026-01-01T00:00:00.000Z",
        synced_at: "2026-08-28T00:00:00.000Z"
      }
    ]
  ]);
  const catalog = new PostgresRegionCatalog(sql);

  assert.deepEqual(await catalog.listSido(), [gwangju]);
  assert.deepEqual(await catalog.listChildren("2900000000", "SIGUNGU"), [gwangsan]);
  assert.deepEqual(await catalog.listChildren("2920000000", "EUPMYEONDONG"), [suwan]);

  for (const call of sql.calls) {
    assert.match(call.text, /active\s*=\s*TRUE/i);
    assert.match(call.text, /ORDER BY/i);
  }
});
