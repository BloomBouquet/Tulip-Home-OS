import type { Home, HomeItem, Routine, TaskOccurrence } from "../../../../packages/contracts/src/index.ts";

export interface HomeRepository {
  findById(id: string): Promise<Home | null>;
  save(home: Home): Promise<void>;
}

export interface RoutineRepository {
  findById(id: string): Promise<Routine | null>;
  listByHomeId(homeId: string): Promise<Routine[]>;
  save(routine: Routine): Promise<void>;
  deleteById(id: string): Promise<void>;
}

export interface HomeItemRepository {
  findById(id: string): Promise<HomeItem | null>;
  listByHomeId(homeId: string): Promise<HomeItem[]>;
  save(item: HomeItem): Promise<void>;
  deleteById(id: string): Promise<void>;
}

export interface TaskOccurrenceRepository {
  findById(id: string): Promise<TaskOccurrence | null>;
  listByHomeId(homeId: string): Promise<TaskOccurrence[]>;
  listCompletedByHomeId(homeId: string, limit: number): Promise<TaskOccurrence[]>;
  save(occurrence: TaskOccurrence): Promise<void>;
}
