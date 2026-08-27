import type { TaskOccurrence } from "../../../../packages/contracts/src/index.ts";

export interface TodaySource {
  getRoutineOccurrences(homeId: string, date: Date): Promise<TaskOccurrence[]>;
  getItemOccurrences(homeId: string, date: Date): Promise<TaskOccurrence[]>;
  getWasteOccurrences(regionCode: string, homeId: string, date: Date): Promise<TaskOccurrence[]>;
}

function seoulDateKey(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface TodayResult {
  date: string;
  summary: {
    pending: number;
    completed: number;
  };
  items: TaskOccurrence[];
  warnings: string[];
}

function occurrenceKey(item: TaskOccurrence): string {
  return `${item.sourceType}:${item.sourceId}:${item.dueAt}`;
}

function deduplicate(items: TaskOccurrence[]): TaskOccurrence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = occurrenceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function buildToday(
  input: { homeId: string; regionCode: string; date: Date },
  source: TodaySource
): Promise<TodayResult> {
  const [routineItems, itemItems] = await Promise.all([
    source.getRoutineOccurrences(input.homeId, input.date),
    source.getItemOccurrences(input.homeId, input.date)
  ]);

  const warnings: string[] = [];
  let wasteItems: TaskOccurrence[] = [];
  try {
    wasteItems = await source.getWasteOccurrences(input.regionCode, input.homeId, input.date);
  } catch {
    warnings.push("쓰레기 일정 정보를 불러오지 못했어요.");
  }

  const items = deduplicate([...routineItems, ...itemItems, ...wasteItems])
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  return {
    date: seoulDateKey(input.date),
    summary: {
      pending: items.filter((item) => item.status === "PENDING").length,
      completed: items.filter((item) => item.status === "DONE").length
    },
    items,
    warnings
  };
}
