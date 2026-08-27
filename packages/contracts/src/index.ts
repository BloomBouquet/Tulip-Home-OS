export type RoutineCategory = "CLEANING" | "LAUNDRY" | "KITCHEN" | "BATHROOM" | "ETC";
export type HomeItemCategory = "APPLIANCE" | "FILTER" | "CONSUMABLE" | "BATTERY" | "ETC";
export type WasteType = "GENERAL" | "FOOD" | "RECYCLING" | "OTHER";
export type TaskSourceType = "ROUTINE" | "HOME_ITEM" | "WASTE";
export type TaskStatus = "PENDING" | "DONE" | "SKIPPED";

export type RecurrenceRule =
  | { type: "DAILY"; interval: number }
  | { type: "WEEKLY"; interval: number; weekdays: number[] }
  | { type: "MONTHLY"; interval: number; day: number }
  | { type: "INTERVAL_DAYS"; interval: number };

export interface User {
  id: string;
  bouquetUserId: string;
  createdAt: string;
}

export interface Home {
  id: string;
  ownerId: string;
  name: string;
  regionCode: string;
  sido: string;
  sigungu: string;
  eupmyeondong: string;
  createdAt: string;
  updatedAt: string;
}

export interface Routine {
  id: string;
  homeId: string;
  title: string;
  category: RoutineCategory;
  recurrence: RecurrenceRule;
  nextDueAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HomeItem {
  id: string;
  homeId: string;
  name: string;
  category: HomeItemCategory;
  purchasedAt?: string;
  warrantyEndsAt?: string;
  replacementIntervalDays?: number;
  inspectionIntervalDays?: number;
  nextActionAt?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WasteSchedule {
  id: string;
  regionCode: string;
  wasteType: WasteType;
  weekdays: number[];
  startTime?: string;
  endTime?: string;
  placeDescription?: string;
  methodDescription?: string;
  sourceUpdatedAt: string;
}

export interface TaskOccurrence {
  id: string;
  homeId: string;
  sourceType: TaskSourceType;
  sourceId: string;
  title: string;
  dueAt: string;
  status: TaskStatus;
  completedAt?: string;
}
