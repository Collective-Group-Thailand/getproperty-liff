import { describe, expect, it } from "vitest";

import { canAddPhotos, fieldActions, groupWorkOrders, isMoneyInput, isQuantityInput, type WorkOrder } from "./model";

const wo = (id: string, status: WorkOrder["status"], scheduledAt: string | null) =>
  ({ id, status, scheduledAt, nextActions: [] }) as unknown as WorkOrder;

describe("technician work orders (L4 4.4)", () => {
  it("groups by schedule: today (and late), upcoming, unscheduled, finished", () => {
    const now = Date.parse("2026-11-02T09:00:00+07:00");
    const groups = groupWorkOrders(
      [
        wo("late", "assigned", "2026-11-01T15:00:00+07:00"),
        wo("today", "accepted", "2026-11-02T23:30:00+07:00"),
        wo("tomorrow", "assigned", "2026-11-03T00:30:00+07:00"),
        wo("none", "assigned", null),
        wo("done", "done", "2026-11-02T08:00:00+07:00"),
      ],
      now,
    );
    expect(groups.today.map((w) => w.id)).toEqual(["late", "today"]);
    expect(groups.upcoming.map((w) => w.id)).toEqual(["tomorrow"]);
    expect(groups.unscheduled.map((w) => w.id)).toEqual(["none"]);
    expect(groups.finished.map((w) => w.id)).toEqual(["done"]);
  });

  it("offers only the field steps the API lists, in order", () => {
    expect(fieldActions({ nextActions: ["complete", "check-in", "accept", "cancel", "verify"] })).toEqual([
      "accept",
      "check-in",
      "complete",
    ]);
  });

  it("takes photos only while the work is open", () => {
    expect(canAddPhotos({ status: "in_progress" })).toBe(true);
    expect(canAddPhotos({ status: "done" })).toBe(false);
  });

  it("accepts prices and quantities as decimal text, never computes them", () => {
    expect(isMoneyInput("350")).toBe(true);
    expect(isMoneyInput("350.50")).toBe(true);
    expect(isMoneyInput("350.505")).toBe(false);
    expect(isMoneyInput("-1")).toBe(false);
    expect(isQuantityInput("1.5")).toBe(true);
    expect(isQuantityInput("0")).toBe(false);
  });
});
