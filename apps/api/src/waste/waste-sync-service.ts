import type { WasteSchedule, WasteType } from "../../../../packages/contracts/src/index.ts";
import { hashOpaqueSecret } from "../auth/opaque-secret-hash.ts";
import type { RegionCatalogReader } from "../regions/region-catalog.ts";
import { normalizeWasteRow } from "./waste-normalizer.ts";

export interface WasteSourceCandidate {
  sido?: string;
  sigungu: string;
  sourceScopeName: string;
  wasteType: WasteType;
  weekdays: string;
  startTime?: string;
  endTime?: string;
  placeDescription?: string;
  methodDescription?: string;
  sourceUpdatedAt: string;
}

export interface ImportedWasteSchedule extends WasteSchedule {
  sourceRowKey: string;
  sourceScopeName: string;
  syncedAt: string;
}

export interface ResolvedWasteRegion {
  regionCode: string;
  sourceScopeName: string;
}

function text(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function publicDate(value: string): string {
  const compact = value.replace(/[^0-9]/g, "");
  if (!/^\d{8}$/.test(compact)) throw new RangeError("waste source date must be YYYYMMDD");
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError("waste source date is invalid");
  }
  return date.toISOString();
}

interface CategoryFields {
  wasteType: WasteType;
  prefix: "LF_WST" | "FOD_WST" | "RCYCL";
}

const CATEGORIES: CategoryFields[] = [
  { wasteType: "GENERAL", prefix: "LF_WST" },
  { wasteType: "FOOD", prefix: "FOD_WST" },
  { wasteType: "RECYCLING", prefix: "RCYCL" }
];

export function expandMoisWasteRow(row: Record<string, unknown>): WasteSourceCandidate[] {
  const sigungu = text(row, "SGG_NM");
  if (!sigungu) throw new RangeError("SGG_NM is required");
  const sido = text(row, "CTPV_NM", "SIDO_NM", "CTPRVN_NM");
  const sourceScopeName = text(row, "MNG_ZONE_TRGT_RGN_NM", "MNG_ZONE_NM") ?? sigungu;
  const placeDescription = text(row, "EMSN_PLC");
  const sourceDate = text(row, "DAT_CRTR_YMD", "DAT_UPDT_PNT");
  if (!sourceDate) throw new RangeError("waste source update date is required");
  const sourceUpdatedAt = publicDate(sourceDate);
  const candidates: WasteSourceCandidate[] = [];

  for (const category of CATEGORIES) {
    const methodDescription = text(row, `${category.prefix}_EMSN_MTHD`);
    const weekdays = text(row, `${category.prefix}_EMSN_DOW`);
    const startTime = text(row, `${category.prefix}_EMSN_BGNG_TM`, `${category.prefix}_BGNG_TM`);
    const endTime = text(row, `${category.prefix}_EMSN_END_TM`, `${category.prefix}_END_TM`);
    const anyCategoryValue = Boolean(methodDescription || weekdays || startTime || endTime);
    if (!anyCategoryValue) continue;
    if (!methodDescription || !weekdays) {
      throw new RangeError(`${category.prefix} requires method and weekdays`);
    }
    candidates.push({
      ...(sido ? { sido } : {}),
      sigungu,
      sourceScopeName,
      wasteType: category.wasteType,
      weekdays,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      ...(placeDescription ? { placeDescription } : {}),
      methodDescription,
      sourceUpdatedAt
    });
  }

  if (candidates.length === 0) throw new RangeError("waste source row contains no publishable categories");
  return candidates;
}

function scopeTokens(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,;/|·()\[\]{}]+/u)
      .map((token) => token.trim())
      .filter(Boolean)
  );
}

export async function resolveWasteRegion(
  candidate: WasteSourceCandidate,
  regions: RegionCatalogReader
): Promise<ResolvedWasteRegion | null> {
  const districts = await regions.findDistrictCandidates(candidate.sido, candidate.sigungu);
  if (districts.length !== 1) return null;
  const district = districts[0];
  const localities = await regions.listChildren(district.regionCode, "EUPMYEONDONG");
  const tokens = scopeTokens(candidate.sourceScopeName);
  const matchedLocalities = localities.filter((locality) => locality.locality && tokens.has(locality.locality));
  if (matchedLocalities.length === 1) {
    return {
      regionCode: matchedLocalities[0].regionCode,
      sourceScopeName: candidate.sourceScopeName
    };
  }
  if (matchedLocalities.length > 1) return null;
  return {
    regionCode: district.regionCode.slice(0, 5),
    sourceScopeName: candidate.sourceScopeName
  };
}

export async function createWasteSourceRowKey(candidate: WasteSourceCandidate): Promise<string> {
  return hashOpaqueSecret(JSON.stringify([
    candidate.sido ?? "",
    candidate.sigungu,
    candidate.sourceScopeName,
    candidate.wasteType,
    candidate.weekdays,
    candidate.startTime ?? "",
    candidate.endTime ?? "",
    candidate.placeDescription ?? "",
    candidate.methodDescription ?? "",
    candidate.sourceUpdatedAt
  ]));
}

export interface WasteSyncClient {
  fetchAll(): Promise<Record<string, unknown>[]>;
}

export interface WasteSyncStore {
  publishSnapshot(rows: ImportedWasteSchedule[]): Promise<void>;
}

export interface WasteSyncDependencies {
  client: WasteSyncClient;
  regions: RegionCatalogReader;
  store: WasteSyncStore;
  now?: () => Date;
  maxRejectedRatio?: number;
}

export interface WasteSyncResult {
  fetched: number;
  expanded: number;
  published: boolean;
  publishedCount: number;
  malformed: number;
  unresolved: number;
  reasons: Record<string, number>;
}

function bump(reasons: Record<string, number>, reason: string): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

export async function syncWasteSchedules(
  dependencies: WasteSyncDependencies
): Promise<WasteSyncResult> {
  const sourceRows = await dependencies.client.fetchAll();
  if (sourceRows.length === 0) {
    throw new Error("MOIS household-waste snapshot is empty");
  }

  const now = (dependencies.now ?? (() => new Date()))();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new RangeError("now() must return a valid date");
  const maxRejectedRatio = dependencies.maxRejectedRatio ?? 0.2;
  if (!Number.isFinite(maxRejectedRatio) || maxRejectedRatio < 0 || maxRejectedRatio > 1) {
    throw new RangeError("maxRejectedRatio must be between 0 and 1");
  }

  let malformed = 0;
  let unresolved = 0;
  let expanded = 0;
  const reasons: Record<string, number> = {};
  const resolvedRows: ImportedWasteSchedule[] = [];

  for (const sourceRow of sourceRows) {
    let candidates: WasteSourceCandidate[];
    try {
      candidates = expandMoisWasteRow(sourceRow);
    } catch {
      malformed += 1;
      bump(reasons, "malformed_source_row");
      continue;
    }
    expanded += candidates.length;

    for (const candidate of candidates) {
      const resolution = await resolveWasteRegion(candidate, dependencies.regions);
      if (!resolution) {
        unresolved += 1;
        bump(reasons, "unresolved_region");
        continue;
      }
      try {
        const sourceRowKey = await createWasteSourceRowKey(candidate);
        const normalized = normalizeWasteRow({
          regionCode: resolution.regionCode,
          wasteType: candidate.wasteType,
          weekdays: candidate.weekdays,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          placeDescription: candidate.placeDescription,
          methodDescription: candidate.methodDescription,
          sourceUpdatedAt: candidate.sourceUpdatedAt
        });
        resolvedRows.push({
          ...normalized,
          id: `waste:${sourceRowKey}`,
          sourceRowKey,
          sourceScopeName: resolution.sourceScopeName,
          syncedAt: now.toISOString()
        });
      } catch {
        malformed += 1;
        bump(reasons, "normalization_failed");
      }
    }
  }

  const rejectedRatio = (malformed + unresolved) / sourceRows.length;
  if (rejectedRatio > maxRejectedRatio) {
    return {
      fetched: sourceRows.length,
      expanded,
      published: false,
      publishedCount: 0,
      malformed,
      unresolved,
      reasons
    };
  }

  await dependencies.store.publishSnapshot(resolvedRows);
  return {
    fetched: sourceRows.length,
    expanded,
    published: true,
    publishedCount: resolvedRows.length,
    malformed,
    unresolved,
    reasons
  };
}
