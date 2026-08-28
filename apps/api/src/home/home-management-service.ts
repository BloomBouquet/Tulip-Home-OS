import type { Home } from "../../../../packages/contracts/src/index.ts";
import type { HomeRepository } from "../persistence/repositories.ts";
import type { RegionCatalogReader } from "../regions/region-catalog.ts";
import { NotFoundError } from "./home-service.ts";

export interface CreateHomeInput {
  name: string;
  regionCode: string;
  sido: string;
  sigungu: string;
  eupmyeondong: string;
}

export type UpdateHomeInput = Partial<CreateHomeInput>;

export interface HomeManagementServiceDependencies {
  homes: HomeRepository;
  now: () => Date;
  createId: () => string;
  regions?: RegionCatalogReader;
}

function required(value: string, field: keyof CreateHomeInput): string {
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${field} is required`);
  return normalized;
}

function optional(value: string | undefined, current: string, field: keyof CreateHomeInput): string {
  return value === undefined ? current : required(value, field);
}

export class HomeManagementService {
  private readonly dependencies: HomeManagementServiceDependencies;

  constructor(dependencies: HomeManagementServiceDependencies) {
    this.dependencies = dependencies;
  }

  private async validateRegionSelection(input: Pick<CreateHomeInput, "regionCode" | "sido" | "sigungu" | "eupmyeondong">): Promise<void> {
    if (!/^\d{10}$/.test(input.regionCode)) {
      throw new RangeError("regionCode must contain exactly 10 digits");
    }

    const regions = this.dependencies.regions;
    if (!regions) return;

    const entry = await regions.findByCode(input.regionCode);
    if (
      !entry ||
      !entry.active ||
      entry.level !== "EUPMYEONDONG" ||
      entry.sido !== input.sido ||
      entry.sigungu !== input.sigungu ||
      entry.locality !== input.eupmyeondong
    ) {
      throw new RangeError("Home region selection does not match the active region catalog");
    }
  }

  async create(currentUserId: string, input: CreateHomeInput): Promise<Home> {
    if (await this.dependencies.homes.findByOwnerId(currentUserId)) {
      throw new RangeError("Home already exists for this user");
    }

    const normalized = {
      name: required(input.name, "name"),
      regionCode: required(input.regionCode, "regionCode"),
      sido: required(input.sido, "sido"),
      sigungu: required(input.sigungu, "sigungu"),
      eupmyeondong: required(input.eupmyeondong, "eupmyeondong")
    };
    await this.validateRegionSelection(normalized);

    const now = this.dependencies.now().toISOString();
    const home: Home = {
      id: this.dependencies.createId(),
      ownerId: currentUserId,
      ...normalized,
      createdAt: now,
      updatedAt: now
    };
    await this.dependencies.homes.save(home);
    return structuredClone(home);
  }

  async getCurrent(currentUserId: string): Promise<Home> {
    const home = await this.dependencies.homes.findByOwnerId(currentUserId);
    if (!home) throw new NotFoundError();
    return home;
  }

  async updateCurrent(currentUserId: string, input: UpdateHomeInput): Promise<Home> {
    const home = await this.getCurrent(currentUserId);
    const updated: Home = {
      ...home,
      name: optional(input.name, home.name, "name"),
      regionCode: optional(input.regionCode, home.regionCode, "regionCode"),
      sido: optional(input.sido, home.sido, "sido"),
      sigungu: optional(input.sigungu, home.sigungu, "sigungu"),
      eupmyeondong: optional(input.eupmyeondong, home.eupmyeondong, "eupmyeondong"),
      updatedAt: this.dependencies.now().toISOString()
    };
    await this.validateRegionSelection(updated);
    await this.dependencies.homes.save(updated);
    return structuredClone(updated);
  }
}
