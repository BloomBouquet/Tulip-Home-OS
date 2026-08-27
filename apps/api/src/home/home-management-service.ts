import type { Home } from "../../../../packages/contracts/src/index.ts";
import type { HomeRepository } from "../persistence/repositories.ts";
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

  async create(currentUserId: string, input: CreateHomeInput): Promise<Home> {
    if (await this.dependencies.homes.findByOwnerId(currentUserId)) {
      throw new RangeError("Home already exists for this user");
    }

    const now = this.dependencies.now().toISOString();
    const home: Home = {
      id: this.dependencies.createId(),
      ownerId: currentUserId,
      name: required(input.name, "name"),
      regionCode: required(input.regionCode, "regionCode"),
      sido: required(input.sido, "sido"),
      sigungu: required(input.sigungu, "sigungu"),
      eupmyeondong: required(input.eupmyeondong, "eupmyeondong"),
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
    await this.dependencies.homes.save(updated);
    return structuredClone(updated);
  }
}
