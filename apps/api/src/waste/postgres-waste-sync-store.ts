import type { SqlExecutor } from "../persistence/postgres-repositories.ts";
import type { ImportedWasteSchedule, WasteSyncStore } from "./waste-sync-service.ts";

function snapshotRow(row: ImportedWasteSchedule) {
  return {
    id: row.id,
    region_code: row.regionCode,
    waste_type: row.wasteType,
    weekdays: row.weekdays,
    start_time: row.startTime ?? null,
    end_time: row.endTime ?? null,
    place_description: row.placeDescription ?? null,
    method_description: row.methodDescription ?? null,
    source_updated_at: row.sourceUpdatedAt,
    source_row_key: row.sourceRowKey,
    source_scope_name: row.sourceScopeName,
    synced_at: row.syncedAt
  };
}

export class PostgresWasteSyncStore implements WasteSyncStore {
  private readonly sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  async publishSnapshot(rows: ImportedWasteSchedule[]): Promise<void> {
    const snapshot = JSON.stringify(rows.map(snapshotRow));
    await this.sql.query(
      `WITH incoming AS (
         SELECT *
         FROM jsonb_to_recordset($1::jsonb) AS x(
           id TEXT,
           region_code TEXT,
           waste_type TEXT,
           weekdays SMALLINT[],
           start_time TEXT,
           end_time TEXT,
           place_description TEXT,
           method_description TEXT,
           source_updated_at TIMESTAMPTZ,
           source_row_key TEXT,
           source_scope_name TEXT,
           synced_at TIMESTAMPTZ
         )
       ), upserted AS (
         INSERT INTO waste_schedules (
           id, region_code, waste_type, weekdays, start_time, end_time,
           place_description, method_description, source_updated_at,
           source_row_key, source_scope_name, synced_at, active
         )
         SELECT
           id, region_code, waste_type, weekdays, start_time, end_time,
           place_description, method_description, source_updated_at,
           source_row_key, source_scope_name, synced_at, TRUE
         FROM incoming
         ON CONFLICT (source_row_key) WHERE source_row_key IS NOT NULL DO UPDATE SET
           id = EXCLUDED.id,
           region_code = EXCLUDED.region_code,
           waste_type = EXCLUDED.waste_type,
           weekdays = EXCLUDED.weekdays,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           place_description = EXCLUDED.place_description,
           method_description = EXCLUDED.method_description,
           source_updated_at = EXCLUDED.source_updated_at,
           source_scope_name = EXCLUDED.source_scope_name,
           synced_at = EXCLUDED.synced_at,
           active = TRUE
         RETURNING source_row_key
       )
       UPDATE waste_schedules
       SET active = FALSE
       WHERE active = TRUE
         AND source_row_key IS NOT NULL
         AND source_row_key NOT IN (SELECT source_row_key FROM incoming)`,
      [snapshot]
    );
  }
}
