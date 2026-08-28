import assert from "node:assert/strict";
import test from "node:test";
import { PostgresWasteScheduleProvider } from "../apps/api/src/waste/postgres-waste-provider.ts";
import type { SqlExecutor, SqlQueryResult } from "../apps/api/src/persistence/postgres-repositories.ts";

class RecordingSql implements SqlExecutor {
  readonly calls: Array<{ text: string; params: readonly unknown[] }> = [];
  private readonly rows: Record<string, unknown>[];

  constructor(rows: Record<string, unknown>[] = []) {
    this.rows = rows;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = []
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, params });
    return { rows: this.rows as Row[] };
  }
}

test("PostgreSQL waste provider queries exact locality plus district scope for the Seoul weekday", async () => {
  const sql = new RecordingSql([
    {
      id: "waste:general",
      region_code: "29200",
      waste_type: "GENERAL",
      weekdays: [1, 3, 5],
      start_time: "20:00",
      end_time: "24:00",
      place_description: "지정 배출장소",
      method_description: "종량제 봉투",
      source_updated_at: new Date("2026-08-26T00:00:00.000Z")
    },
    {
      id: "waste:recycling",
      region_code: "2920011400",
      waste_type: "RECYCLING",
      weekdays: [1],
      start_time: null,
      end_time: null,
      place_description: null,
      method_description: "품목별 분리",
      source_updated_at: "2026-08-26T00:00:00.000Z"
    }
  ]);
  const provider = new PostgresWasteScheduleProvider(sql);

  const schedules = await provider.getByRegionAndDate(
    "2920011400",
    new Date("2026-08-24T12:00:00+09:00")
  );

  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /active\s*=\s*TRUE/i);
  assert.match(sql.calls[0].text, /region_code\s*=\s*ANY/i);
  assert.match(sql.calls[0].text, /\$2\s*=\s*ANY\(weekdays\)/i);
  assert.match(sql.calls[0].text, /ORDER BY\s+waste_type.*start_time.*id/is);
  assert.deepEqual(sql.calls[0].params, [["2920011400", "29200"], 1]);
  assert.deepEqual(schedules, [
    {
      id: "waste:general",
      regionCode: "29200",
      wasteType: "GENERAL",
      weekdays: [1, 3, 5],
      startTime: "20:00",
      endTime: "24:00",
      placeDescription: "지정 배출장소",
      methodDescription: "종량제 봉투",
      sourceUpdatedAt: "2026-08-26T00:00:00.000Z"
    },
    {
      id: "waste:recycling",
      regionCode: "2920011400",
      wasteType: "RECYCLING",
      weekdays: [1],
      methodDescription: "품목별 분리",
      sourceUpdatedAt: "2026-08-26T00:00:00.000Z"
    }
  ]);
});

test("PostgreSQL waste provider rejects non-canonical Home region codes before querying", async () => {
  const sql = new RecordingSql();
  const provider = new PostgresWasteScheduleProvider(sql);

  await assert.rejects(
    () => provider.getByRegionAndDate("29200", new Date("2026-08-24T12:00:00+09:00")),
    /10 digits/i
  );
  assert.equal(sql.calls.length, 0);
});
