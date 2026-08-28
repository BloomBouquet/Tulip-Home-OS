export type RegionLevel = "SIDO" | "SIGUNGU" | "EUPMYEONDONG";

export interface RegionCatalogEntry {
  regionCode: string;
  sido: string;
  sigungu?: string;
  locality?: string;
  parentRegionCode?: string;
  level: RegionLevel;
  active: boolean;
  sourceUpdatedAt: string;
  syncedAt: string;
}

export interface RegionCatalogReader {
  findByCode(regionCode: string): Promise<RegionCatalogEntry | null>;
  listSido(): Promise<RegionCatalogEntry[]>;
  listChildren(parentRegionCode: string, level: Exclude<RegionLevel, "SIDO">): Promise<RegionCatalogEntry[]>;
  findDistrictCandidates(sido: string | undefined, sigungu: string): Promise<RegionCatalogEntry[]>;
}

export interface RegionCatalogPublisher {
  publishSnapshot(entries: RegionCatalogEntry[]): Promise<void>;
}
