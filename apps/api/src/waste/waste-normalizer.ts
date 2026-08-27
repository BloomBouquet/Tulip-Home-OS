import type { WasteSchedule, WasteType } from "../../../../packages/contracts/src/index.ts";

export interface RawWasteRow {
  regionCode: string;
  wasteType: string;
  weekdays: string;
  startTime?: string;
  endTime?: string;
  placeDescription?: string;
  methodDescription?: string;
  sourceUpdatedAt: string;
}

export class WasteNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WasteNormalizationError";
  }
}

const WEEKDAY_MAP: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6
};

function normalizeWasteType(value: string): WasteType {
  const compact = value.replace(/\s+/g, "");
  if (compact.includes("재활용")) return "RECYCLING";
  if (compact.includes("음식")) return "FOOD";
  if (compact.includes("일반") || compact.includes("생활")) return "GENERAL";
  return "OTHER";
}

function parseWeekdays(value: string): number[] {
  const tokens = value
    .split(/[,;/·|]+/)
    .map((token) => token.trim().replace(/요일$/u, ""))
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new WasteNormalizationError("weekday value is required");
  }

  const weekdays = tokens.map((token) => {
    if (!(token in WEEKDAY_MAP)) {
      throw new WasteNormalizationError(`unsupported weekday: ${token}`);
    }
    return WEEKDAY_MAP[token];
  });

  return [...new Set(weekdays)].sort((a, b) => a - b);
}

export function normalizeWasteRow(row: RawWasteRow): WasteSchedule {
  const regionCode = row.regionCode.trim();
  if (!regionCode) {
    throw new WasteNormalizationError("region code is required");
  }

  const weekdays = parseWeekdays(row.weekdays);
  const wasteType = normalizeWasteType(row.wasteType);
  const sourceDate = new Date(row.sourceUpdatedAt);
  if (Number.isNaN(sourceDate.getTime())) {
    throw new WasteNormalizationError("source update date is invalid");
  }

  return {
    id: `${regionCode}:${wasteType}:${weekdays.join("-")}`,
    regionCode,
    wasteType,
    weekdays,
    startTime: row.startTime?.trim() || undefined,
    endTime: row.endTime?.trim() || undefined,
    placeDescription: row.placeDescription?.trim() || undefined,
    methodDescription: row.methodDescription?.trim() || undefined,
    sourceUpdatedAt: sourceDate.toISOString()
  };
}
