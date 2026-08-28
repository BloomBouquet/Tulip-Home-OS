import type { RegionCatalogEntry, RegionLevel } from "./region-catalog.ts";

export type MoisRegionSourceRow = Record<string, unknown>;
export type RegionFetch = typeof fetch;

export interface MoisRegionApiClientOptions {
  baseUrl: string;
  serviceKey: string;
  pageSize?: number;
  fetcher?: RegionFetch;
}

function requiredText(row: MoisRegionSourceRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new RangeError(`${key} is required`);
  }
  const text = String(value).trim();
  if (!text) throw new RangeError(`${key} is required`);
  return text;
}

function optionalText(row: MoisRegionSourceRow, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function parseSourceDate(value: string): string {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) throw new RangeError("adpt_de must be YYYYMMDD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("adpt_de is not a valid calendar date");
  }
  return date.toISOString();
}

function deriveLevel(sggCode: string, umdCode: string): RegionLevel {
  if (sggCode === "000" && umdCode === "000") return "SIDO";
  if (sggCode !== "000" && umdCode === "000") return "SIGUNGU";
  if (sggCode !== "000" && umdCode !== "000") return "EUPMYEONDONG";
  throw new RangeError("legal-dong code hierarchy is inconsistent");
}

export function normalizeMoisRegionRow(
  row: MoisRegionSourceRow,
  syncedAt: Date
): RegionCatalogEntry | null {
  if (!(syncedAt instanceof Date) || Number.isNaN(syncedAt.getTime())) {
    throw new RangeError("syncedAt must be a valid date");
  }

  const regionCode = requiredText(row, "region_cd");
  const sidoCode = requiredText(row, "sido_cd");
  const sggCode = requiredText(row, "sgg_cd");
  const umdCode = requiredText(row, "umd_cd");
  const riCode = requiredText(row, "ri_cd");
  const fullName = requiredText(row, "locatadd_nm");
  const localName = requiredText(row, "locallow_nm");
  const adoptedAt = requiredText(row, "adpt_de");

  if (!/^\d{10}$/.test(regionCode)) throw new RangeError("region_cd must be 10 digits");
  if (!/^\d{2}$/.test(sidoCode)) throw new RangeError("sido_cd must be 2 digits");
  if (!/^\d{3}$/.test(sggCode)) throw new RangeError("sgg_cd must be 3 digits");
  if (!/^\d{3}$/.test(umdCode)) throw new RangeError("umd_cd must be 3 digits");
  if (!/^\d{2}$/.test(riCode)) throw new RangeError("ri_cd must be 2 digits");
  if (riCode !== "00") return null;

  const level = deriveLevel(sggCode, umdCode);
  const parts = fullName.split(/\s+/u).filter(Boolean);
  if (parts.length === 0) throw new RangeError("locatadd_nm is invalid");
  const sido = level === "SIDO" ? fullName : parts[0];
  const parentCandidate = optionalText(row, "locathigh_cd");
  const parentRegionCode = parentCandidate && /^\d{10}$/.test(parentCandidate) && parentCandidate !== "0000000000"
    ? parentCandidate
    : undefined;

  if (level === "SIDO") {
    return {
      regionCode,
      sido,
      level,
      active: true,
      sourceUpdatedAt: parseSourceDate(adoptedAt),
      syncedAt: syncedAt.toISOString()
    };
  }

  if (level === "SIGUNGU") {
    const sigungu = localName;
    if (!sigungu) throw new RangeError("sigungu name is required");
    return {
      regionCode,
      sido,
      sigungu,
      ...(parentRegionCode ? { parentRegionCode } : {}),
      level,
      active: true,
      sourceUpdatedAt: parseSourceDate(adoptedAt),
      syncedAt: syncedAt.toISOString()
    };
  }

  const locality = localName;
  const middle = parts.slice(1, parts[parts.length - 1] === locality ? -1 : undefined);
  const sigungu = middle.join(" ").trim();
  if (!sigungu || !locality) throw new RangeError("locality hierarchy is incomplete");
  return {
    regionCode,
    sido,
    sigungu,
    locality,
    ...(parentRegionCode ? { parentRegionCode } : {}),
    level,
    active: true,
    sourceUpdatedAt: parseSourceDate(adoptedAt),
    syncedAt: syncedAt.toISOString()
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numeric(value: unknown): number | null {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function parseStanRegionEnvelope(payload: unknown): { rows: MoisRegionSourceRow[]; total: number } | null {
  const root = asRecord(payload);
  const sections = root?.StanReginCd;
  if (!Array.isArray(sections)) return null;

  let rows: MoisRegionSourceRow[] | null = null;
  let total: number | null = null;
  for (const sectionValue of sections) {
    const section = asRecord(sectionValue);
    if (!section) continue;
    if (Array.isArray(section.row)) {
      rows = section.row.filter((item): item is MoisRegionSourceRow => asRecord(item) !== null) as MoisRegionSourceRow[];
    }
    if (Array.isArray(section.head)) {
      for (const headValue of section.head) {
        const head = asRecord(headValue);
        if (!head) continue;
        total ??= numeric(head.totalCount);
        total ??= numeric(head.list_total_count);
      }
    }
  }
  if (!rows || total === null) throw new Error("MOIS region response is missing rows or total count");
  return { rows, total };
}

function parseStandardEnvelope(payload: unknown): { rows: MoisRegionSourceRow[]; total: number } | null {
  const root = asRecord(payload);
  const response = asRecord(root?.response);
  const body = asRecord(response?.body);
  if (!body) return null;
  const itemsContainer = asRecord(body.items);
  const rawItems = itemsContainer?.item ?? body.items;
  const rows = Array.isArray(rawItems)
    ? rawItems.filter((item): item is MoisRegionSourceRow => asRecord(item) !== null) as MoisRegionSourceRow[]
    : asRecord(rawItems) ? [rawItems as MoisRegionSourceRow] : [];
  const total = numeric(body.totalCount);
  if (total === null) throw new Error("MOIS region response is missing total count");
  return { rows, total };
}

function parsePage(payload: unknown): { rows: MoisRegionSourceRow[]; total: number } {
  const parsed = parseStanRegionEnvelope(payload) ?? parseStandardEnvelope(payload);
  if (!parsed) throw new Error("MOIS region response shape is unsupported");
  return parsed;
}

export class MoisRegionApiClient {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly pageSize: number;
  private readonly fetcher: RegionFetch;

  constructor(options: MoisRegionApiClientOptions) {
    const baseUrl = options.baseUrl.trim();
    const serviceKey = options.serviceKey.trim();
    if (!baseUrl) throw new RangeError("baseUrl is required");
    if (!serviceKey) throw new RangeError("serviceKey is required");
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new RangeError("baseUrl must use http or https");
    }
    const pageSize = options.pageSize ?? 1000;
    if (!Number.isInteger(pageSize) || pageSize <= 0) throw new RangeError("pageSize must be a positive integer");
    this.baseUrl = baseUrl;
    this.serviceKey = serviceKey;
    this.pageSize = pageSize;
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchAll(): Promise<MoisRegionSourceRow[]> {
    const rows: MoisRegionSourceRow[] = [];
    let pageNo = 1;
    let total = Number.POSITIVE_INFINITY;

    while (rows.length < total) {
      const url = new URL(this.baseUrl);
      url.searchParams.set("ServiceKey", this.serviceKey);
      url.searchParams.set("pageNo", String(pageNo));
      url.searchParams.set("numOfRows", String(this.pageSize));
      url.searchParams.set("type", "json");

      const response = await this.fetcher(url);
      if (!response.ok) throw new Error(`MOIS region request failed with ${response.status}`);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("MOIS region response is not valid JSON");
      }
      const page = parsePage(payload);
      total = page.total;
      rows.push(...page.rows);
      if (rows.length >= total) break;
      if (page.rows.length === 0) throw new Error("MOIS region pagination ended before total count");
      pageNo += 1;
    }

    return rows.slice(0, total);
  }
}
