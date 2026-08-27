import type { HomeItem, Routine, TaskOccurrence } from "../../../../packages/contracts/src/index.ts";
import { assertHomeOwner, NotFoundError } from "../home/home-service.ts";
import type {
  HomeItemRepository,
  HomeRepository,
  RoutineRepository,
  TaskOccurrenceRepository
} from "../persistence/repositories.ts";
import { calculateNextDueAt } from "../routines/recurrence.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OccurrenceServiceDependencies {
  homes: HomeRepository;
  routines: RoutineRepository;
  items: HomeItemRepository;
  occurrences: TaskOccurrenceRepository;
  now: () => Date;
}

function nextItemActionAt(item: HomeItem, dueAt: string): string | undefined {
  const intervals = [item.replacementIntervalDays, item.inspectionIntervalDays]
    .filter((value): value is number => value !== undefined && Number.isInteger(value) && value > 0);
  if (intervals.length === 0) return undefined;
  const days = Math.min(...intervals);
  return new Date(new Date(dueAt).getTime() + days * DAY_MS).toISOString();
}

export class OccurrenceService {
  private readonly dependencies: OccurrenceServiceDependencies;

  constructor(dependencies: OccurrenceServiceDependencies) {
    this.dependencies = dependencies;
  }

  private async assertOwnedHome(homeId: string, currentUserId: string): Promise<void> {
    const home = await this.dependencies.homes.findById(homeId);
    if (!home) throw new NotFoundError();
    assertHomeOwner(home, currentUserId);
  }

  private async getOwnedOccurrence(id: string, currentUserId: string): Promise<TaskOccurrence> {
    const occurrence = await this.dependencies.occurrences.findById(id);
    if (!occurrence) throw new NotFoundError();
    await this.assertOwnedHome(occurrence.homeId, currentUserId);
    return occurrence;
  }

  private async advanceRoutine(occurrence: TaskOccurrence, completedAt: string): Promise<void> {
    const routine = await this.dependencies.routines.findById(occurrence.sourceId);
    if (!routine || routine.homeId !== occurrence.homeId || !routine.isActive) return;
    if (routine.nextDueAt !== occurrence.dueAt) return;

    const nextDueAt = calculateNextDueAt(new Date(occurrence.dueAt), routine.recurrence).toISOString();
    await this.dependencies.routines.save({ ...routine, nextDueAt, updatedAt: completedAt });
  }

  private async advanceItem(occurrence: TaskOccurrence, completedAt: string): Promise<void> {
    const item = await this.dependencies.items.findById(occurrence.sourceId);
    if (!item || item.homeId !== occurrence.homeId || item.nextActionAt !== occurrence.dueAt) return;
    const nextActionAt = nextItemActionAt(item, occurrence.dueAt);
    if (!nextActionAt) return;
    await this.dependencies.items.save({ ...item, nextActionAt, updatedAt: completedAt });
  }

  private async rewindRoutine(occurrence: TaskOccurrence, updatedAt: string): Promise<void> {
    const routine = await this.dependencies.routines.findById(occurrence.sourceId);
    if (!routine || routine.homeId !== occurrence.homeId) return;
    const expectedNext = calculateNextDueAt(new Date(occurrence.dueAt), routine.recurrence).toISOString();
    if (routine.nextDueAt !== expectedNext) return;
    await this.dependencies.routines.save({ ...routine, nextDueAt: occurrence.dueAt, updatedAt });
  }

  private async rewindItem(occurrence: TaskOccurrence, updatedAt: string): Promise<void> {
    const item = await this.dependencies.items.findById(occurrence.sourceId);
    if (!item || item.homeId !== occurrence.homeId) return;
    const expectedNext = nextItemActionAt(item, occurrence.dueAt);
    if (!expectedNext || item.nextActionAt !== expectedNext) return;
    await this.dependencies.items.save({ ...item, nextActionAt: occurrence.dueAt, updatedAt });
  }

  async complete(currentUserId: string, id: string): Promise<TaskOccurrence> {
    const occurrence = await this.getOwnedOccurrence(id, currentUserId);
    if (occurrence.status === "DONE") return structuredClone(occurrence);

    const completedAt = this.dependencies.now().toISOString();
    if (occurrence.sourceType === "ROUTINE") {
      await this.advanceRoutine(occurrence, completedAt);
    } else if (occurrence.sourceType === "HOME_ITEM") {
      await this.advanceItem(occurrence, completedAt);
    }

    const completed: TaskOccurrence = {
      ...occurrence,
      status: "DONE",
      completedAt
    };
    await this.dependencies.occurrences.save(completed);
    return structuredClone(completed);
  }

  async undo(currentUserId: string, id: string): Promise<TaskOccurrence> {
    const occurrence = await this.getOwnedOccurrence(id, currentUserId);
    if (occurrence.status === "PENDING") return structuredClone(occurrence);

    const updatedAt = this.dependencies.now().toISOString();
    if (occurrence.status === "DONE") {
      if (occurrence.sourceType === "ROUTINE") {
        await this.rewindRoutine(occurrence, updatedAt);
      } else if (occurrence.sourceType === "HOME_ITEM") {
        await this.rewindItem(occurrence, updatedAt);
      }
    }

    const pending: TaskOccurrence = {
      id: occurrence.id,
      homeId: occurrence.homeId,
      sourceType: occurrence.sourceType,
      sourceId: occurrence.sourceId,
      title: occurrence.title,
      dueAt: occurrence.dueAt,
      status: "PENDING"
    };
    await this.dependencies.occurrences.save(pending);
    return structuredClone(pending);
  }

  async listHistory(currentUserId: string, homeId: string, limit = 50): Promise<TaskOccurrence[]> {
    await this.assertOwnedHome(homeId, currentUserId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError("history limit must be an integer from 1 through 100");
    }
    return this.dependencies.occurrences.listCompletedByHomeId(homeId, limit);
  }
}
