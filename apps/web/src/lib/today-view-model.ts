import type { TaskOccurrence, TaskSourceType } from "../../../../packages/contracts/src/index.ts";
import type { TodayResult } from "../../../api/src/today/today-aggregator.ts";

export interface TodayCardViewModel {
  id: string;
  title: string;
  category: string;
  dueAt: string;
  status: TaskOccurrence["status"];
}

export interface TodayViewModel {
  headline: string;
  completedLabel: string;
  cards: TodayCardViewModel[];
  overdueCards: TodayCardViewModel[];
  todayCards: TodayCardViewModel[];
  completedCards: TodayCardViewModel[];
  overdue: TaskOccurrence[];
  today: TaskOccurrence[];
  completed: TaskOccurrence[];
  warnings: string[];
}

function koreaDayBounds(date: string): { start: number; end: number } {
  const start = Date.parse(`${date}T00:00:00+09:00`);
  if (Number.isNaN(start)) {
    throw new RangeError("today date must use YYYY-MM-DD format");
  }
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function categoryLabel(sourceType: TaskSourceType): string {
  if (sourceType === "ROUTINE") return "루틴";
  if (sourceType === "HOME_ITEM") return "우리집";
  return "쓰레기";
}

function toCard(item: TaskOccurrence): TodayCardViewModel {
  return {
    id: item.id,
    title: item.title,
    category: categoryLabel(item.sourceType),
    dueAt: item.dueAt,
    status: item.status
  };
}

export function createTodayViewModel(result: TodayResult): TodayViewModel {
  const { start, end } = koreaDayBounds(result.date);
  const pending = result.items.filter((item) => item.status === "PENDING");
  const completed = result.items.filter((item) => item.status === "DONE");
  const overdue = pending.filter((item) => Date.parse(item.dueAt) < start);
  const today = pending.filter((item) => {
    const dueAt = Date.parse(item.dueAt);
    return dueAt >= start && dueAt < end;
  });

  return {
    headline: result.summary.pending === 0
      ? "오늘 할 일을 모두 마쳤어요."
      : `오늘 집에서 해야 할 일 ${result.summary.pending}개가 있어요.`,
    completedLabel: `${result.summary.completed}개 완료`,
    cards: result.items.map(toCard),
    overdueCards: overdue.map(toCard),
    todayCards: today.map(toCard),
    completedCards: completed.map(toCard),
    overdue,
    today,
    completed,
    warnings: [...result.warnings]
  };
}

export const buildTodayViewModel = createTodayViewModel;
