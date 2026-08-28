import type { Home } from "../../../../packages/contracts/src/index.ts";
import type { BouquetIdentity } from "../../../api/src/auth/bouquet-auth-adapter.ts";
import type { TodayResult } from "../../../api/src/today/today-aggregator.ts";
import type { HomeOnboardingInput, RegionSelectionOption } from "./home-onboarding-model.ts";

export type TulipWebFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class TulipApiClientError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Tulip API request failed (${status})`);
    this.name = "TulipApiClientError";
    this.status = status;
  }
}

export class TulipApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: TulipWebFetch;

  constructor(baseUrl = "/api/tulip", fetcher: TulipWebFetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) throw new TulipApiClientError(response.status);
    return await response.json() as T;
  }

  me(): Promise<BouquetIdentity> {
    return this.request<BouquetIdentity>("/v1/me");
  }

  async currentHome(): Promise<Home | null> {
    try {
      return await this.request<Home>("/v1/homes/current");
    } catch (error) {
      if (error instanceof TulipApiClientError && error.status === 404) return null;
      throw error;
    }
  }

  sidoRegions(): Promise<RegionSelectionOption[]> {
    return this.request<RegionSelectionOption[]>("/v1/regions/sido");
  }

  sigunguRegions(parentCode: string): Promise<RegionSelectionOption[]> {
    return this.request<RegionSelectionOption[]>(`/v1/regions/sigungu?parentCode=${encodeURIComponent(parentCode)}`);
  }

  localityRegions(parentCode: string): Promise<RegionSelectionOption[]> {
    return this.request<RegionSelectionOption[]>(`/v1/regions/localities?parentCode=${encodeURIComponent(parentCode)}`);
  }

  createHome(input: HomeOnboardingInput): Promise<Home> {
    return this.request<Home>("/v1/homes", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  today(date?: string): Promise<TodayResult> {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return this.request<TodayResult>(`/v1/today${query}`);
  }
}
