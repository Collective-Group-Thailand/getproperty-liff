import { describe, expect, it } from "vitest";

import { alignByPosition, parseRange, usageWindow } from "./range";

const NOW = Date.parse("2026-11-10T09:30:00+07:00");

describe("usage windows", () => {
  it("asks for Bangkok days, today included, and the same length before", () => {
    const week = usageWindow("7d", NOW);
    expect(week).toMatchObject({ bucket: "1d", buckets: 7 });
    expect(week.current.from).toBe(new Date("2026-11-04T00:00:00+07:00").toISOString());
    expect(week.previous).toEqual({
      from: new Date("2026-10-28T00:00:00+07:00").toISOString(),
      to: week.current.from,
    });
    expect(usageWindow("30d", NOW).current.from).toBe(new Date("2026-10-12T00:00:00+07:00").toISOString());
  });

  it("asks for the last 24 hours by hour and the day before", () => {
    const day = usageWindow("24h", NOW);
    expect(day).toMatchObject({ bucket: "1h", buckets: 24 });
    expect(day.current.from).toBe(new Date("2026-11-09T10:00:00+07:00").toISOString());
    expect(day.previous.from).toBe(new Date("2026-11-08T10:00:00+07:00").toISOString());
  });

  it("defaults to 7 days and lines points up by position", () => {
    expect(parseRange(undefined)).toBe("7d");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange(["24h"])).toBe("7d");
    const start = "2026-11-04T00:00:00+07:00";
    const slots = alignByPosition(
      [
        { bucket: "2026-11-05T00:00:00+07:00", usage: "6.000" },
        { bucket: "2026-11-01T00:00:00+07:00", usage: "1.000" },
      ],
      start,
      "1d",
      7,
    );
    expect(slots.map((s) => s?.usage ?? null)).toEqual([null, "6.000", null, null, null, null, null]);
  });
});
