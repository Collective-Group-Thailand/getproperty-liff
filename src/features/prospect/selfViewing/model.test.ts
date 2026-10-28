import { describe, expect, it } from "vitest";

import { accessOpen, missingSteps, msUntil, safeNext, slotsOfMode, termsText, windowPhase } from "./model";

const access = {
  state: "issued" as const,
  validFrom: "2026-11-07T09:55:00+07:00",
  validTo: "2026-11-07T10:30:00+07:00",
  enteredAt: null,
  enteredSource: null,
  exitedAt: null,
  closedAt: null,
  closeReason: null,
  incidentAt: null,
  incidentNote: null,
  workOrderId: null,
};

describe("self-viewing model (GL2, D-295)", () => {
  it("splits slots by mode", () => {
    const slots = [
      { startsAt: "a", endsAt: "b", mode: "accompanied" as const },
      { startsAt: "c", endsAt: "d", mode: "self" as const },
    ];
    expect(slotsOfMode(slots, "self").map((s) => s.startsAt)).toEqual(["c"]);
    expect(slotsOfMode(slots, "accompanied").map((s) => s.startsAt)).toEqual(["a"]);
  });

  it("words the code window", () => {
    expect(windowPhase(access, Date.parse("2026-11-07T09:54:59+07:00"))).toBe("before");
    expect(windowPhase(access, Date.parse("2026-11-07T09:55:00+07:00"))).toBe("open");
    expect(windowPhase(access, Date.parse("2026-11-07T10:30:00+07:00"))).toBe("after");
    expect(msUntil(access.validTo, Date.parse("2026-11-07T10:29:00+07:00"))).toBe(60_000);
    expect(msUntil(access.validTo, Date.parse("2026-11-07T11:00:00+07:00"))).toBe(0);
  });

  it("knows an open access window", () => {
    expect(accessOpen(access)).toBe(true);
    expect(accessOpen({ ...access, state: "entered" })).toBe(true);
    expect(accessOpen({ ...access, state: "exited", closedAt: "x" })).toBe(false);
    expect(accessOpen(null)).toBe(false);
  });

  it("shows the terms as returned: Thai for Thai, English otherwise", () => {
    const terms = { version: 2, th: "ไทย", en: "English" };
    expect(termsText(terms, "th")).toBe("ไทย");
    expect(termsText(terms, "my")).toBe("English");
  });

  it("lists the steps still open", () => {
    expect(missingSteps({ identityVerified: false, phoneVerified: false })).toEqual(["identity", "phone"]);
    expect(missingSteps({ identityVerified: true, phoneVerified: true })).toEqual([]);
  });

  it("returns only to a self-viewing page", () => {
    expect(safeNext("/rent/condo-1br-a1b2c3d4e5/self-viewing")).toBe("/rent/condo-1br-a1b2c3d4e5/self-viewing");
    expect(safeNext("//evil.example/rent/x/self-viewing")).toBeNull();
    expect(safeNext("/rent/x/self-viewing?x=1")).toBeNull();
    expect(safeNext(["/rent/x/self-viewing"])).toBeNull();
  });
});
