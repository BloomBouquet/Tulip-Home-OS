import type { RecurrenceRule } from "../../../../packages/contracts/src/index.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function assertPositiveInterval(interval: number): void {
  if (!Number.isInteger(interval) || interval < 1) {
    throw new RangeError("recurrence interval must be a positive integer");
  }
}

export function validateRecurrenceRule(rule: RecurrenceRule): void {
  assertPositiveInterval(rule.interval);

  if (rule.type === "WEEKLY") {
    const weekdays = [...new Set(rule.weekdays)];
    if (weekdays.length === 0 || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new RangeError("weekly recurrence requires weekdays from 0 through 6");
    }
  }

  if (rule.type === "MONTHLY" && (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31)) {
    throw new RangeError("monthly recurrence requires a day from 1 through 31");
  }
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function calculateNextDueAt(
  currentDueAt: Date,
  rule: RecurrenceRule,
  _timeZone = "Asia/Seoul"
): Date {
  if (Number.isNaN(currentDueAt.getTime())) {
    throw new RangeError("current due date must be valid");
  }

  validateRecurrenceRule(rule);

  if (rule.type === "DAILY" || rule.type === "INTERVAL_DAYS") {
    return addUtcDays(currentDueAt, rule.interval);
  }

  if (rule.type === "WEEKLY") {
    const weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);

    const currentWeekday = currentDueAt.getUTCDay();
    const laterThisWeek = weekdays.find((day) => day > currentWeekday);
    if (laterThisWeek !== undefined) {
      return addUtcDays(currentDueAt, laterThisWeek - currentWeekday);
    }

    const firstWeekday = weekdays[0];
    const daysUntilNextCycle = 7 * rule.interval - currentWeekday + firstWeekday;
    return addUtcDays(currentDueAt, daysUntilNextCycle);
  }

  const targetMonthStart = new Date(Date.UTC(
    currentDueAt.getUTCFullYear(),
    currentDueAt.getUTCMonth() + rule.interval,
    1,
    currentDueAt.getUTCHours(),
    currentDueAt.getUTCMinutes(),
    currentDueAt.getUTCSeconds(),
    currentDueAt.getUTCMilliseconds()
  ));
  const targetDay = Math.min(rule.day, daysInUtcMonth(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth()));
  targetMonthStart.setUTCDate(targetDay);
  return targetMonthStart;
}
