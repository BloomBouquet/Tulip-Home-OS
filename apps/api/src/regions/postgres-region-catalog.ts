import type { SqlExecutor } from "../persistence/postgres-repositories.ts";
import type {
  RegionCatalogEntry,
  RegionCatalogPublisher,
  RegionCatalogReader,
  RegionLevel
} from "./region-catalog.ts";

export type { RegionCatalogEntry, RegionCatalogReader, RegionLevel } from "./region-catalog.ts";

interface RegionCatalogRow extends Record<string, unknown> {
  region_code: string;
  sido: string;
  sigungu: string | null;
  locality: string | null;
  parent_region_code: string | null;
  level: RegionLevel;
  active: boolean;
  source_updated_at: Date | string;
  synced_at: Date | string;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: RegionCatalogRow): RegionCatalogEntry {
  return {
    regionCode: row.region_code,
    sido: row.sido,
    ...(row.sigungu ? { sigungu: row.sigungu } : {}),
    ...(row.locality ? { locality: row.locality } : {}),
    ...(row.parent_region_code ? { parentRegionCode: row.parent_region_code } : {}),
    level: row.level,
    active: row.active,
    sourceUpdatedAt: timestamp(row.source_updated_at),
    syncedAt: timestamp(row.synced_at)
  };
}

function snapshotRow(entry: RegionCatalogEntry) {
  return {
    region_code: entry.regionCode,
    sido: entry.sido,
    sigungu: entry.sigungu ?? null,
    locality: entry.locality ?? null,
    parent_region_code: entry.parentRegionCode ?? null,
    level: entry.level,
    source_updated_at: entry.sourceUpdatedAt,
    synced_at: entry.syncedAt
  };
}

export class PostgresRegionCatalog implements RegionCatalogReader, RegionCatalogPublisher {
  private readonly sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  async publishSnapshot(entries: RegionCatalogEntry[]): Promise<void> {
    const snapshot = JSON.stringify(entries.map(snapshotRow));
    await this.sql.query(
      `WITH incoming AS (
         SELECT *
         FROM jsonb_to_recordset($1::jsonb) AS x(
           region_code TEXT,
           sido TEXT,
           sigungu TEXT,
           locality TEXT,
           parent_region_code TEXT,
           level TEXT,
           source_updated_at TIMESTAMPTZ,
           synced_at TIMESTAMPTZ
         )
       ), upserted AS (
         INSERT INTO region_catalog (
           region_code, sido, sigungu, locality, parent_region_code,
           level, active, source_updated_at, synced_at
         )
         SELECT
           region_code, sido, sigungu, locality, parent_region_code,
           level, TRUE, source_updated_at, synced_at
         FROM incoming
         ON CONFLICT (region_code) DO UPDATE SET
           sido = EXCLUDED.sido,
           sigungu = EXCLUDED.sigungu,
           locality = EXCLUDED.locality,
           parent_region_code = EXCLUDED.parent_region_code,
           level = EXCLUDED.level,
           active = TRUE,
           source_updated_at = EXCLUDED.source_updated_at,
           synced_at = EXCLUDED.synced_at
         RETURNING region_code
       )
       UPDATE region_catalog
       SET active = FALSE
       WHERE active = TRUE
         AND region_code NOT IN (SELECT region_code FROM incoming)`,
      [snapshot]
    );
  }

  async findByCode(regionCode: string): Promise<RegionCatalogEntry | null> {
    const result = await this.sql.query<RegionCatalogRow>(
      `SELECT region_code, sido, sigungu, locality, parent_region_code, level,
              active, source_updated_at, synced_at
       FROM region_catalog
       WHERE region_code = $1 AND active = TRUE
       LIMIT 1`,
      [regionCode]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listSido(): Promise<RegionCatalogEntry[]> {
    const result = await this.sql.query<RegionCatalogRow>(
      `SELECT region_code, sido, sigungu, locality, parent_region_code, level,
              active, source_updated_at, synced_at
       FROM region_catalog
       WHERE active = TRUE AND level = 'SIDO'
       ORDER BY sido ASC, region_code ASC`
    );
    return result.rows.map(mapRow);
  }

  async listChildren(
    parentRegionCode: string,
    level: Exclude<RegionLevel, "SIDO">
  ): Promise<RegionCatalogEntry[]> {
    const result = await this.sql.query<RegionCatalogRow>(
      `SELECT region_code, sido, sigungu, locality, parent_region_code, level,
              active, source_updated_at, synced_at
       FROM region_catalog
       WHERE active = TRUE
         AND parent_region_code = $1
         AND level = $2
       ORDER BY sido ASC, sigungu ASC NULLS FIRST, locality ASC NULLS FIRST, region_code ASC`,
      [parentRegionCode, level]
    );
    return result.rows.map(mapRow);
  }

  async findDistrictCandidates(sido: string | undefined, sigungu: string): Promise<RegionCatalogEntry[]> {
    const normalizedSigungu = sigungu.trim();
    if (!normalizedSigungu) return [];
    const normalizedSido = sido?.trim();
    const result = normalizedSido
      ? await this.sql.query<RegionCatalogRow>(
          `SELECT region_code, sido, sigungu, locality, parent_region_code, level,
                  active, source_updated_at, synced_at
           FROM region_catalog
           WHERE active = TRUE AND level = 'SIGUNGU' AND sido = $1 AND sigungu = $2
           ORDER BY region_code ASC`,
          [normalizedSido, normalizedSigungu]
        )
      : await this.sql.query<RegionCatalogRow>(
          `SELECT region_code, sido, sigungu, locality, parent_region_code, level,
                  active, source_updated_at, synced_at
           FROM region_catalog
           WHERE active = TRUE AND level = 'SIGUNGU' AND sigungu = $1
           ORDER BY sido ASC, region_code ASC`,
          [normalizedSigungu]
        );
    return result.rows.map(mapRow);
  }
}
