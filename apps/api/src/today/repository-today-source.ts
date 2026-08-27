import type { HomeItem, Routine, TaskOccurrence, WasteSchedule, WasteType } from "../../../../packages/contracts/src/index.ts";
import type { HomeItemRepository, RoutineRepository, TaskOccurrenceRepository } from "../persistence/repositories.ts";
import type { WasteScheduleProvider } from "../waste/waste-provider.ts";
import type { TodaySource } from "./today-aggregator.ts";

export interface RepositoryTodaySourceDependencies {
  routines: RoutineRepository;
  items: HomeItemRepository;
  occurrences: TaskOccurrenceRepository;
  waste: WasteScheduleProvider;
}

function seoulDateKey(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function seoulEndOfDay(date: Date): Date {
  return new Date(`${seoulDateKey(date)}T23:59:59.999+09:00`);
}

function occurrenceId(homeId: string, sourceType: TaskOccurrence["sourceType"], sourceId: string, dueAt: string): string {
  return `occ:${homeId}:${sourceType}:${sourceId}:${dueAt}`;
}

function wasteTitle(type: WasteType): string {
  if (type === "GENERAL") return "일반쓰레기 배출";
  if (type === "FOOD") return "음식물쓰레기 배출";
  if (type === "RECYCLING") return "재활용품 배출";
  return "기타 폐기물 배출";
}

function wasteDueAt(schedule: WasteSchedule, date: Date): string {
  const dateKey = seoulDateKey(date);
  const raw = schedule.startTime?.trim() || "12:00";
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return new Date(`${dateKey}T12:00:00+09:00`).toISOString();

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) {
    return new Date(new Date(`${dateKey}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  if (hour > 23 || minute > 59) return new Date(`${dateKey}T12:00:00+09:00`).toISOString();
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`).toISOString();
}

function routineToOccurrence(routine: Routine): TaskOccurrence {
  return {
    id: occurrenceId(routine.homeId, "ROUTINE", routine.id, routine.nextDueAt),
    homeId: routine.homeId,
    sourceType: "ROUTINE",
    sourceId: routine.id,
    title: routine.title,
    dueAt: routine.nextDueAt,
    status: "PENDING"
  };
}

function itemToOccurrence(item: HomeItem): TaskOccurrence | null {
  if (!item.nextActionAt) return null;
  return {
    id: occurrenceId(item.homeId, "HOME_ITEM", item.id, item.nextActionAt),
    homeId: item.homeId,
    sourceType: "HOME_ITEM",
    sourceId: item.id,
    title: `${item.name} 점검`,
    dueAt: item.nextActionAt,
    status: "PENDING"
  };
}

function wasteToOccurrence(schedule: WasteSchedule, homeId: string, date: Date): TaskOccurrence {
  const dueAt = wasteDueAt(schedule, date);
  return {
    id: occurrenceId(homeId, "WASTE", schedule.id, dueAt),
    homeId,
    sourceType: "WASTE",
    sourceId: schedule.id,
    title: wasteTitle(schedule.wasteType),
    dueAt,
    status: "PENDING"
  };
}

export class RepositoryTodaySource implements TodaySource {
  private readonly dependencies: RepositoryTodaySourceDependencies;

  constructor(dependencies: RepositoryTodaySourceDependencies) {
    this.dependencies = dependencies;
  }

  private async materialize(candidate: TaskOccurrence): Promise<TaskOccurrence> {
    const existing = await this.dependencies.occurrences.findById(candidate.id);
    if (existing) return existing;
    await this.dependencies.occurrences.save(candidate);
    return candidate;
  }

  async getRoutineOccurrences(homeId: string, date: Date): Promise<TaskOccurrence[]> {
    const end = seoulEndOfDay(date).getTime();
    const routines = await this.dependencies.routines.listByHomeId(homeId);
    const candidates = routines
      .filter((routine) => routine.isActive && new Date(routine.nextDueAt).getTime() <= end)
      .map(routineToOccurrence);
    return Promise.all(candidates.map((candidate) => this.materialize(candidate)));
  }

  async getItemOccurrences(homeId: string, date: Date): Promise<TaskOccurrence[]> {
    const end = seoulEndOfDay(date).getTime();
    const items = await this.dependencies.items.listByHomeId(homeId);
    const candidates = items
      .map(itemToOccurrence)
      .filter((candidate): candidate is TaskOccurrence => candidate !== null)
      .filter((candidate) => new Date(candidate.dueAt).getTime() <= end);
    return Promise.all(candidates.map((candidate) => this.materialize(candidate)));
  }

  async getWasteOccurrences(regionCode: string, homeId: string, date: Date): Promise<TaskOccurrence[]> {
    const schedules = await this.dependencies.waste.getByRegionAndDate(regionCode, date);
    const candidates = schedules.map((schedule) => wasteToOccurrence(schedule, homeId, date));
    return Promise.all(candidates.map((candidate) => this.materialize(candidate)));
  }
}
