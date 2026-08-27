import type { WasteSchedule } from "../../../../packages/contracts/src/index.ts";

export interface WasteScheduleProvider {
  getByRegionAndDate(regionCode: string, date: Date): Promise<WasteSchedule[]>;
}
