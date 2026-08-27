import type { Home, HomeItem, Routine, TaskOccurrence } from "../../../../packages/contracts/src/index.ts";
import type {
  HomeItemRepository,
  HomeRepository,
  RoutineRepository,
  TaskOccurrenceRepository
} from "./repositories.ts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryHomeRepository implements HomeRepository {
  private readonly records = new Map<string, Home>();

  async findById(id: string): Promise<Home | null> {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }

  async save(home: Home): Promise<void> {
    this.records.set(home.id, clone(home));
  }
}

export class InMemoryRoutineRepository implements RoutineRepository {
  private readonly records = new Map<string, Routine>();

  async findById(id: string): Promise<Routine | null> {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }

  async listByHomeId(homeId: string): Promise<Routine[]> {
    return [...this.records.values()]
      .filter((record) => record.homeId === homeId)
      .map(clone);
  }

  async save(routine: Routine): Promise<void> {
    this.records.set(routine.id, clone(routine));
  }

  async deleteById(id: string): Promise<void> {
    this.records.delete(id);
  }
}

export class InMemoryHomeItemRepository implements HomeItemRepository {
  private readonly records = new Map<string, HomeItem>();

  async findById(id: string): Promise<HomeItem | null> {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }

  async listByHomeId(homeId: string): Promise<HomeItem[]> {
    return [...this.records.values()]
      .filter((record) => record.homeId === homeId)
      .map(clone);
  }

  async save(item: HomeItem): Promise<void> {
    this.records.set(item.id, clone(item));
  }

  async deleteById(id: string): Promise<void> {
    this.records.delete(id);
  }
}

export class InMemoryTaskOccurrenceRepository implements TaskOccurrenceRepository {
  private readonly records = new Map<string, TaskOccurrence>();

  async findById(id: string): Promise<TaskOccurrence | null> {
    const record = this.records.get(id);
    return record ? clone(record) : null;
  }

  async listByHomeId(homeId: string): Promise<TaskOccurrence[]> {
    return [...this.records.values()]
      .filter((record) => record.homeId === homeId)
      .map(clone);
  }

  async listCompletedByHomeId(homeId: string, limit: number): Promise<TaskOccurrence[]> {
    return [...this.records.values()]
      .filter((record) => record.homeId === homeId && record.status === "DONE" && record.completedAt)
      .sort((left, right) => new Date(right.completedAt!).getTime() - new Date(left.completedAt!).getTime())
      .slice(0, Math.max(0, limit))
      .map(clone);
  }

  async save(occurrence: TaskOccurrence): Promise<void> {
    this.records.set(occurrence.id, clone(occurrence));
  }
}
