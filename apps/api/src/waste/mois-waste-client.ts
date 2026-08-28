export type MoisWasteSourceRow = Record<string, unknown>;
export type WasteFetch = typeof fetch;

export interface MoisWasteApiClientOptions {
  baseUrl: string;
  serviceKey: string;
  pageSize?: number;
  fetcher?: WasteFetch;
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

function parsePage(payload: unknown): { rows: MoisWasteSourceRow[]; total: number } {
  const root = asRecord(payload);
  const response = asRecord(root?.response);
  const header = asRecord(response?.header);
  const body = asRecord(response?.body);
  if (!header || !body) throw new Error("MOIS household-waste source response shape is unsupported");

  const resultCode = String(header.resultCode ?? "").trim();
  if (resultCode !== "00") {
    throw new Error(`MOIS household-waste source result code ${resultCode || "missing"}`);
  }

  const total = numeric(body.totalCount);
  if (total === null) throw new Error("MOIS household-waste source response is missing total count");

  const items = asRecord(body.items);
  const rawItems = items?.item ?? body.items;
  const rows = Array.isArray(rawItems)
    ? rawItems.filter((item): item is MoisWasteSourceRow => asRecord(item) !== null) as MoisWasteSourceRow[]
    : asRecord(rawItems) ? [rawItems as MoisWasteSourceRow] : [];

  return { rows, total };
}

export class MoisWasteApiClient {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly pageSize: number;
  private readonly fetcher: WasteFetch;

  constructor(options: MoisWasteApiClientOptions) {
    const baseUrl = options.baseUrl.trim();
    const serviceKey = options.serviceKey.trim();
    if (!baseUrl) throw new RangeError("baseUrl is required");
    if (!serviceKey) throw new RangeError("serviceKey is required");

    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new RangeError("baseUrl must use http or https");
    }

    const pageSize = options.pageSize ?? 1000;
    if (!Number.isInteger(pageSize) || pageSize <= 0) {
      throw new RangeError("pageSize must be a positive integer");
    }

    this.baseUrl = baseUrl;
    this.serviceKey = serviceKey;
    this.pageSize = pageSize;
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchAll(): Promise<MoisWasteSourceRow[]> {
    const rows: MoisWasteSourceRow[] = [];
    let pageNo = 1;
    let total = Number.POSITIVE_INFINITY;

    while (rows.length < total) {
      const url = new URL(this.baseUrl);
      url.searchParams.set("serviceKey", this.serviceKey);
      url.searchParams.set("returnType", "json");
      url.searchParams.set("pageNo", String(pageNo));
      url.searchParams.set("numOfRows", String(this.pageSize));

      const response = await this.fetcher(url);
      if (!response.ok) {
        throw new Error(`MOIS household-waste source request failed with ${response.status}`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("MOIS household-waste source response is not valid JSON");
      }

      const page = parsePage(payload);
      total = page.total;
      rows.push(...page.rows);
      if (rows.length >= total) break;
      if (page.rows.length === 0) {
        throw new Error("MOIS household-waste source pagination ended before total count");
      }
      pageNo += 1;
    }

    return rows.slice(0, total);
  }
}
