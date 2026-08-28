import type { WasteSchedule, WasteType } from "../../../../packages/contracts/src/index.ts";
import type { SqlExecutor } from "../persistence/postgres-repositories.ts";
import type { WasteScheduleProvider } from "./waste-provider.ts";

type WasteScheduleRow = Record<string, unknown> & {
  id: unknown;
  region_code: unknown;
  waste_type: unknown;
  weekdays: unknown;
  start_time?: unknown;
  end_time?: unknown;
  place_description?: unknown;
  method_description?: unknown;
  source_updated_at: unknown;
};

const WASTE_TYPES = new Set<WasteType>(["GENERAL", "FOOD", "RECYCLING", "OTHER"]);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`${field} must be a string when present`);
  const normalized = value.trim();
  return normalized || undefined;
}

function wasteType(value: unknown): WasteType {
  const normalized = requiredText(value, "waste_type") as WasteType;
  if (!WASTE_TYPES.has(normalized)) throw new TypeError("waste_type is unsupported");
  return normalized;
}

function weekdays(value: unknown): number[] {
  if (!Array.isArray(value)) throw new TypeError("weekdays must be an array");
  const normalized = value.map(Number);
  if (normalized.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new TypeError("weekdays must contain integers from 0 through 6");
  }
  return normalized;
}

function isoTimestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(requiredText(value, "source_updated_at"));
  if (Number.isNaN(date.getTime())) throw new TypeError("source_updated_at must be a valid timestamp");
  return date.toISOString();
}

function seoulWeekday(date: Date): number {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("date must be valid");
  }
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
}

function mapRow(row: WasteScheduleRow): WasteSchedule {
  const startTime = optionalText(row.start_time, "start_time");
  const endTime = optionalText(row.end_time, "end_time");
  const placeDescription = optionalText(row.place_description, "place_description");
  const methodDescription = optionalText(row.method_description, "method_description");

  return {
    id: requiredText(row.id, "id"),
    regionCode: requiredText(row.region_code, "region_code"),
    wasteType: wasteType(row.waste_type),
    weekdays: weekdays(row.weekdays),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(placeDescription ? { placeDescription } : {}),
    ...(methodDescription ? { methodDescription } : {}),
    sourceUpdatedAt: isoTimestamp(row.source_updated_at)
  };
}

export class PostgresWasteScheduleProvider implements WasteScheduleProvider {
  private readonly sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  async getByRegionAndDate(regionCode: string, date: Date): Promise<WasteSchedule[]> {
    if (!/^\d{10}$/.test(regionCode)) {
      throw new RangeError("Home region code must contain exactly 10 digits");
    }

    const weekday = seoulWeekday(date);
    const scopes = [regionCode, regionCode.slice(0, 5)];
    const result = await this.sql.query<WasteScheduleRow>(
      `SELECT id,
              region_code,
              waste_type,
              weekdays,
              start_time,
              end_time,
              place_description,
              method_description,
              source_updated_at
         FROM waste_schedules
        WHERE active = TRUE
          AND region_code = ANY($1::text[])
          AND $2 = ANY(weekdays)
        ORDER BY waste_type ASC, start_time ASC NULLS LAST, id ASC`,
      [scopes, weekday]
    );

    return result.rows.map(mapRow);
  }
}
