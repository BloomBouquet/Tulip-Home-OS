import type { HomeItem, HomeItemCategory } from "../../../../packages/contracts/src/index.ts";
import { assertHomeOwner, NotFoundError } from "../home/home-service.ts";
import type { HomeItemRepository, HomeRepository } from "../persistence/repositories.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateHomeItemInput {
  homeId: string;
  name: string;
  category: HomeItemCategory;
  purchasedAt?: string;
  warrantyEndsAt?: string;
  replacementIntervalDays?: number;
  inspectionIntervalDays?: number;
  nextActionAt?: string;
  note?: string;
}

export interface UpdateHomeItemInput {
  name?: string;
  category?: HomeItemCategory;
  purchasedAt?: string;
  warrantyEndsAt?: string;
  replacementIntervalDays?: number;
  inspectionIntervalDays?: number;
  nextActionAt?: string;
  note?: string;
}

export interface HomeItemServiceDependencies {
  homes: HomeRepository;
  items: HomeItemRepository;
  now: () => Date;
  createId: () => string;
}

function normalizeName(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RangeError("item name is required");
  return normalized;
}

function validateCategory(category: HomeItemCategory): HomeItemCategory {
  const supported = new Set<HomeItemCategory>(["APPLIANCE", "FILTER", "CONSUMABLE", "BATTERY", "ETC"]);
  if (!supported.has(category)) throw new RangeError("unsupported item category");
  return category;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeDate(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`${field} must be a valid date`);
  return date.toISOString();
}

function validateInterval(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError("item interval must be a positive integer");
  }
  return value;
}

function deriveNextActionAt(input: {
  purchasedAt?: string;
  replacementIntervalDays?: number;
  inspectionIntervalDays?: number;
  nextActionAt?: string;
}): string | undefined {
  const explicit = normalizeDate(input.nextActionAt, "nextActionAt");
  if (explicit) return explicit;

  const purchasedAt = normalizeDate(input.purchasedAt, "purchasedAt");
  if (!purchasedAt) return undefined;

  const intervals = [input.replacementIntervalDays, input.inspectionIntervalDays]
    .filter((value): value is number => value !== undefined);
  if (intervals.length === 0) return undefined;

  const interval = Math.min(...intervals);
  return new Date(new Date(purchasedAt).getTime() + interval * DAY_MS).toISOString();
}

export class HomeItemService {
  private readonly dependencies: HomeItemServiceDependencies;

  constructor(dependencies: HomeItemServiceDependencies) {
    this.dependencies = dependencies;
  }

  private async assertOwnedHome(homeId: string, currentUserId: string): Promise<void> {
    const home = await this.dependencies.homes.findById(homeId);
    if (!home) throw new NotFoundError();
    assertHomeOwner(home, currentUserId);
  }

  private async getOwnedItem(id: string, currentUserId: string): Promise<HomeItem> {
    const item = await this.dependencies.items.findById(id);
    if (!item) throw new NotFoundError();
    await this.assertOwnedHome(item.homeId, currentUserId);
    return item;
  }

  async create(currentUserId: string, input: CreateHomeItemInput): Promise<HomeItem> {
    await this.assertOwnedHome(input.homeId, currentUserId);
    const replacementIntervalDays = validateInterval(input.replacementIntervalDays);
    const inspectionIntervalDays = validateInterval(input.inspectionIntervalDays);
    const purchasedAt = normalizeDate(input.purchasedAt, "purchasedAt");
    const warrantyEndsAt = normalizeDate(input.warrantyEndsAt, "warrantyEndsAt");
    const now = this.dependencies.now().toISOString();
    const nextActionAt = deriveNextActionAt({
      purchasedAt,
      replacementIntervalDays,
      inspectionIntervalDays,
      nextActionAt: input.nextActionAt
    });

    const item: HomeItem = {
      id: this.dependencies.createId(),
      homeId: input.homeId,
      name: normalizeName(input.name),
      category: validateCategory(input.category),
      ...(purchasedAt ? { purchasedAt } : {}),
      ...(warrantyEndsAt ? { warrantyEndsAt } : {}),
      ...(replacementIntervalDays ? { replacementIntervalDays } : {}),
      ...(inspectionIntervalDays ? { inspectionIntervalDays } : {}),
      ...(nextActionAt ? { nextActionAt } : {}),
      ...(normalizeOptionalText(input.note) ? { note: normalizeOptionalText(input.note) } : {}),
      createdAt: now,
      updatedAt: now
    };
    await this.dependencies.items.save(item);
    return structuredClone(item);
  }

  async list(currentUserId: string, homeId: string): Promise<HomeItem[]> {
    await this.assertOwnedHome(homeId, currentUserId);
    return this.dependencies.items.listByHomeId(homeId);
  }

  async get(currentUserId: string, id: string): Promise<HomeItem> {
    return structuredClone(await this.getOwnedItem(id, currentUserId));
  }

  async update(currentUserId: string, id: string, input: UpdateHomeItemInput): Promise<HomeItem> {
    const item = await this.getOwnedItem(id, currentUserId);
    const purchasedAt = input.purchasedAt !== undefined
      ? normalizeDate(input.purchasedAt, "purchasedAt")
      : item.purchasedAt;
    const warrantyEndsAt = input.warrantyEndsAt !== undefined
      ? normalizeDate(input.warrantyEndsAt, "warrantyEndsAt")
      : item.warrantyEndsAt;
    const replacementIntervalDays = input.replacementIntervalDays !== undefined
      ? validateInterval(input.replacementIntervalDays)
      : item.replacementIntervalDays;
    const inspectionIntervalDays = input.inspectionIntervalDays !== undefined
      ? validateInterval(input.inspectionIntervalDays)
      : item.inspectionIntervalDays;

    const scheduleChanged = input.purchasedAt !== undefined
      || input.replacementIntervalDays !== undefined
      || input.inspectionIntervalDays !== undefined;
    const nextActionAt = input.nextActionAt !== undefined
      ? normalizeDate(input.nextActionAt, "nextActionAt")
      : scheduleChanged
        ? deriveNextActionAt({ purchasedAt, replacementIntervalDays, inspectionIntervalDays })
        : item.nextActionAt;

    const updated: HomeItem = {
      ...item,
      ...(input.name !== undefined ? { name: normalizeName(input.name) } : {}),
      ...(input.category !== undefined ? { category: validateCategory(input.category) } : {}),
      ...(purchasedAt ? { purchasedAt } : {}),
      ...(warrantyEndsAt ? { warrantyEndsAt } : {}),
      ...(replacementIntervalDays ? { replacementIntervalDays } : {}),
      ...(inspectionIntervalDays ? { inspectionIntervalDays } : {}),
      ...(nextActionAt ? { nextActionAt } : {}),
      ...(input.note !== undefined ? { note: normalizeOptionalText(input.note) } : {}),
      updatedAt: this.dependencies.now().toISOString()
    };

    await this.dependencies.items.save(updated);
    return structuredClone(updated);
  }

  async delete(currentUserId: string, id: string): Promise<void> {
    await this.getOwnedItem(id, currentUserId);
    await this.dependencies.items.deleteById(id);
  }
}
