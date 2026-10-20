import { describe, expect, it } from "vitest";

import { bookingDays, daySlots, durationsFrom, slotState } from "./slots";

const policy = { slotMinutes: 60, openFrom: "08:00", openTo: "11:00", maxDurationMinutes: 120, maxAdvanceDays: 14 };

describe("facility slots (D-212 policy, presentation only)", () => {
  it("cuts a Bangkok day into whole slots inside the opening hours", () => {
    const slots = daySlots(policy, "2026-11-02");
    expect(slots.map((s) => `${s.from}-${s.to}`)).toEqual(["08:00-09:00", "09:00-10:00", "10:00-11:00"]);
    expect(slots[0]!.startsAt).toBe("2026-11-02T08:00:00+07:00");
    expect(daySlots({}, "2026-11-02")).toHaveLength(14);
  });

  it("marks busy, mine, passed and free from the API's busy list", () => {
    const slots = daySlots(policy, "2026-11-02");
    const busy = [
      {
        startsAt: "2026-11-02T09:00:00+07:00",
        endsAt: "2026-11-02T10:00:00+07:00",
        status: "confirmed" as const,
        mine: false,
      },
      {
        startsAt: "2026-11-02T10:00:00+07:00",
        endsAt: "2026-11-02T11:00:00+07:00",
        status: "requested" as const,
        mine: true,
      },
    ];
    const now = Date.parse("2026-11-02T08:30:00+07:00");
    expect(slots.map((s) => slotState(s, busy, now))).toEqual(["past", "busy", "mine"]);
    expect(slotState(slots[0]!, [], Date.parse("2026-11-01T12:00:00+07:00"))).toBe("free");
  });

  it("offers durations of consecutive free slots up to the maximum", () => {
    const slots = daySlots({ ...policy, openTo: "13:00" }, "2026-11-02");
    const states = ["free", "free", "free", "busy", "free"] as const;
    expect(durationsFrom(0, slots, [...states], policy).map((d) => d.minutes)).toEqual([60, 120]);
    expect(durationsFrom(2, slots, [...states], policy).map((d) => d.to)).toEqual(["11:00"]);
  });

  it("lists today and the next days, bounded by the policy and a week", () => {
    const now = Date.parse("2026-11-01T23:30:00+07:00");
    expect(bookingDays({ maxAdvanceDays: 3 }, now)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(bookingDays({}, now)).toHaveLength(7);
  });
});
