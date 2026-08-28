import type { RegionCatalogEntry, RegionCatalogPublisher } from "./region-catalog.ts";
import { normalizeMoisRegionRow, type MoisRegionSourceRow } from "./mois-region-client.ts";

export interface RegionSyncClient {
  fetchAll(): Promise<MoisRegionSourceRow[]>;
}

export interface RegionSyncDependencies {
  client: RegionSyncClient;
  catalog: RegionCatalogPublisher;
  now?: () => Date;
}

export interface RegionSyncResult {
  fetched: number;
  accepted: number;
  rejected: number;
}

export async function syncRegionCatalog(
  dependencies: RegionSyncDependencies
): Promise<RegionSyncResult> {
  const rows = await dependencies.client.fetchAll();
  if (rows.length === 0) {
    throw new Error("MOIS region snapshot is empty");
  }

  const syncedAt = (dependencies.now ?? (() => new Date()))();
  if (!(syncedAt instanceof Date) || Number.isNaN(syncedAt.getTime())) {
    throw new RangeError("now() must return a valid date");
  }

  const entries: RegionCatalogEntry[] = [];
  let rejected = 0;
  for (const row of rows) {
    try {
      const normalized = normalizeMoisRegionRow(row, syncedAt);
      if (normalized) entries.push(normalized);
      else rejected += 1;
    } catch {
      rejected += 1;
    }
  }

  if (entries.length === 0) {
    throw new Error("MOIS region snapshot contains no publishable rows");
  }

  await dependencies.catalog.publishSnapshot(entries);
  return {
    fetched: rows.length,
    accepted: entries.length,
    rejected
  };
}
