import type {
  RecurrenceRule,
  Routine,
  RoutineCategory
} from "../../../../packages/contracts/src/index.ts";
import { assertHomeOwner, NotFoundError } from "../home/home-service.ts";
import type { HomeRepository, RoutineRepository } from "../persistence/repositories.ts";
import { validateRecurrenceRule } from "./recurrence.ts";

export interface CreateRoutineInput {
  homeId: string;
  title: string;
  category: RoutineCategory;
  recurrence: RecurrenceRule;
  firstDueAt: string;
}

export interface UpdateRoutineInput {
  title?: string;
  category?: RoutineCategory;
  recurrence?: RecurrenceRule;
  nextDueAt?: string;
  isActive?: boolean;
}

export interface RoutineServiceDependencies {
  homes: HomeRepository;
  routines: RoutineRepository;
  now: () => Date;
  createId: () => string;
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) throw new RangeError("routine title is required");
  return normalized;
}

function validateCategory(category: RoutineCategory): RoutineCategory {
  const supported = new Set<RoutineCategory>(["CLEANING", "LAUNDRY", "KITCHEN", "BATHROOM", "ETC"]);
  if (!supported.has(category)) throw new RangeError("unsupported routine category");
  return category;
}

function requireIsoDate(value: string, fieldName: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`${fieldName} must be a valid date`);
  return date.toISOString();
}

export class RoutineService {
  private readonly dependencies: RoutineServiceDependencies;

  constructor(dependencies: RoutineServiceDependencies) {
    this.dependencies = dependencies;
  }

  private async assertOwnedHome(homeId: string, currentUserId: string): Promise<void> {
    const home = await this.dependencies.homes.findById(homeId);
    if (!home) throw new NotFoundError();
    assertHomeOwner(home, currentUserId);
  }

  private async getOwnedRoutine(id: string, currentUserId: string): Promise<Routine> {
    const routine = await this.dependencies.routines.findById(id);
    if (!routine) throw new NotFoundError();
    await this.assertOwnedHome(routine.homeId, currentUserId);
    return routine;
  }

  async create(currentUserId: string, input: CreateRoutineInput): Promise<Routine> {
    await this.assertOwnedHome(input.homeId, currentUserId);
    validateRecurrenceRule(input.recurrence);
    const now = this.dependencies.now().toISOString();
    const routine: Routine = {
      id: this.dependencies.createId(),
      homeId: input.homeId,
      title: normalizeTitle(input.title),
      category: validateCategory(input.category),
      recurrence: structuredClone(input.recurrence),
      nextDueAt: requireIsoDate(input.firstDueAt, "firstDueAt"),
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    await this.dependencies.routines.save(routine);
    return structuredClone(routine);
  }

  async list(currentUserId: string, homeId: string): Promise<Routine[]> {
    await this.assertOwnedHome(homeId, currentUserId);
    return this.dependencies.routines.listByHomeId(homeId);
  }

  async update(currentUserId: string, id: string, input: UpdateRoutineInput): Promise<Routine> {
    const routine = await this.getOwnedRoutine(id, currentUserId);
    if (input.recurrence !== undefined) validateRecurrenceRule(input.recurrence);
    const updated: Routine = {
      ...routine,
      ...(input.title !== undefined ? { title: normalizeTitle(input.title) } : {}),
      ...(input.category !== undefined ? { category: validateCategory(input.category) } : {}),
      ...(input.recurrence !== undefined ? { recurrence: structuredClone(input.recurrence) } : {}),
      ...(input.nextDueAt !== undefined ? { nextDueAt: requireIsoDate(input.nextDueAt, "nextDueAt") } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: this.dependencies.now().toISOString()
    };
    await this.dependencies.routines.save(updated);
    return structuredClone(updated);
  }

  async delete(currentUserId: string, id: string): Promise<void> {
    await this.getOwnedRoutine(id, currentUserId);
    await this.dependencies.routines.deleteById(id);
  }
}
