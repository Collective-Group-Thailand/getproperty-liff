/**
 * The periods the usage screen asks the API for (`GET /v1/resident/leases/{id}/usage`, buckets 1h / 1d): the last
 * 24 hours by hour, the last 7 or 30 days by Bangkok day (today included, so far), and the period just before for
 * the comparison. Only request windows are computed here — never a quantity.
 */
export const USAGE_RANGES = ["24h", "7d", "30d"] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];

export interface UsageWindow {
  bucket: "1h" | "1d";
  current: { from: string; to: string };
  previous: { from: string; to: string };
  /** Number of buckets in each period (the previous period is aligned to the current one by position). */
  buckets: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BANGKOK = 7 * HOUR;

export function parseRange(value: string | string[] | undefined): UsageRange {
  return typeof value === "string" && (USAGE_RANGES as readonly string[]).includes(value)
    ? (value as UsageRange)
    : "7d";
}

export function usageWindow(range: UsageRange, now: number = Date.now()): UsageWindow {
  if (range === "24h") {
    const hour = Math.floor(now / HOUR) * HOUR;
    const from = hour - 23 * HOUR;
    return {
      bucket: "1h",
      buckets: 24,
      current: { from: iso(from), to: iso(now) },
      previous: { from: iso(from - DAY), to: iso(from) },
    };
  }
  const days = range === "7d" ? 7 : 30;
  const midnight = Math.floor((now + BANGKOK) / DAY) * DAY - BANGKOK;
  const from = midnight - (days - 1) * DAY;
  return {
    bucket: "1d",
    buckets: days,
    current: { from: iso(from), to: iso(now) },
    previous: { from: iso(from - days * DAY), to: iso(from) },
  };
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Lines points up by bucket position from the start of each period (day 1 with day 1, 14:00 with 14:00). */
export function alignByPosition<T extends { bucket: string }>(
  points: T[],
  start: string,
  bucket: "1h" | "1d",
  buckets: number,
): (T | null)[] {
  const step = bucket === "1h" ? HOUR : DAY;
  const origin = Date.parse(start);
  const slots: (T | null)[] = Array.from({ length: buckets }, () => null);
  for (const point of points) {
    const index = Math.round((Date.parse(point.bucket) - origin) / step);
    if (index >= 0 && index < buckets) slots[index] = point;
  }
  return slots;
}
