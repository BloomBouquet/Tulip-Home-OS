import { createPgPoolExecutor } from "../persistence/pg-executor.ts";
import { MoisRegionApiClient, type RegionFetch } from "../regions/mois-region-client.ts";
import { PostgresRegionCatalog } from "../regions/postgres-region-catalog.ts";
import { syncRegionCatalog, type RegionSyncResult } from "../regions/region-sync-service.ts";
import { MoisWasteApiClient } from "../waste/mois-waste-client.ts";
import { PostgresWasteSyncStore } from "../waste/postgres-waste-sync-store.ts";
import { syncWasteSchedules, type WasteSyncResult } from "../waste/waste-sync-service.ts";

export interface OfficialDataSyncConfig {
  databaseUrl: string;
  serviceKey: string;
  regionApiUrl: string;
  wasteApiUrl: string;
  wasteMaxRejectedRatio: number;
}

function requiredEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new RangeError(`${name} is required`);
  return value;
}

function rejectedRatio(env: Record<string, string | undefined>): number {
  const raw = env.TULIP_WASTE_MAX_REJECTED_RATIO?.trim();
  if (!raw) return 0.2;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("TULIP_WASTE_MAX_REJECTED_RATIO must be between 0 and 1");
  }
  return value;
}

export function loadOfficialDataSyncConfig(
  env: Record<string, string | undefined>
): OfficialDataSyncConfig {
  return {
    databaseUrl: requiredEnv(env, "DATABASE_URL"),
    serviceKey: requiredEnv(env, "DATA_GO_KR_API_KEY"),
    regionApiUrl: requiredEnv(env, "TULIP_REGION_API_URL"),
    wasteApiUrl: requiredEnv(env, "TULIP_WASTE_API_URL"),
    wasteMaxRejectedRatio: rejectedRatio(env)
  };
}

export interface OfficialDataSyncDependencies {
  syncRegions(): Promise<RegionSyncResult>;
  syncWaste(): Promise<WasteSyncResult>;
  close(): Promise<void>;
}

export interface OfficialDataSyncResult {
  regions: RegionSyncResult;
  waste: WasteSyncResult;
}

export async function runOfficialDataSync(
  dependencies: OfficialDataSyncDependencies
): Promise<OfficialDataSyncResult> {
  try {
    const regions = await dependencies.syncRegions();
    const waste = await dependencies.syncWaste();
    if (!waste.published) {
      throw new Error(
        `waste snapshot publication was rejected (malformed=${waste.malformed}, unresolved=${waste.unresolved})`
      );
    }
    return { regions, waste };
  } finally {
    await dependencies.close();
  }
}

export function createOfficialDataSyncDependencies(
  config: OfficialDataSyncConfig,
  fetcher: RegionFetch = fetch
): OfficialDataSyncDependencies {
  const sql = createPgPoolExecutor(config.databaseUrl);
  const regions = new PostgresRegionCatalog(sql);
  const regionClient = new MoisRegionApiClient({
    baseUrl: config.regionApiUrl,
    serviceKey: config.serviceKey,
    fetcher
  });
  const wasteClient = new MoisWasteApiClient({
    baseUrl: config.wasteApiUrl,
    serviceKey: config.serviceKey,
    fetcher
  });
  const wasteStore = new PostgresWasteSyncStore(sql);

  return {
    syncRegions() {
      return syncRegionCatalog({ client: regionClient, catalog: regions });
    },
    syncWaste() {
      return syncWasteSchedules({
        client: wasteClient,
        regions,
        store: wasteStore,
        maxRejectedRatio: config.wasteMaxRejectedRatio
      });
    },
    close() {
      return sql.close();
    }
  };
}

export function runOfficialDataSyncFromEnv(
  env: Record<string, string | undefined>,
  fetcher: RegionFetch = fetch
): Promise<OfficialDataSyncResult> {
  const config = loadOfficialDataSyncConfig(env);
  return runOfficialDataSync(createOfficialDataSyncDependencies(config, fetcher));
}
