import { describe, expect, it } from "vitest";

import { HOLD_MS, IDLE, TAP_MS, holdProgress, holdStep, type HoldState } from "./hold";

describe("hold-to-confirm", () => {
  it("completes after 1.5 s held, on the frame tick or on release", () => {
    let s: HoldState = holdStep(IDLE, { type: "down", now: 1000 });
    expect(holdProgress(s, 1750)).toBeCloseTo(0.5);
    s = holdStep(s, { type: "tick", now: 1000 + HOLD_MS - 1 });
    expect(s.phase).toBe("holding");
    expect(holdStep(s, { type: "tick", now: 1000 + HOLD_MS })).toEqual({ phase: "done" });
    expect(holdStep(s, { type: "up", now: 1000 + HOLD_MS + 5 })).toEqual({ phase: "done" });
  });

  it("a release before 1.5 s cancels — a quick tap shows the hint, an abandoned hold does not", () => {
    const held = holdStep(IDLE, { type: "down", now: 0 });
    expect(holdStep(held, { type: "up", now: TAP_MS - 1 })).toEqual({ phase: "idle", hint: true });
    expect(holdStep(held, { type: "up", now: 1200 })).toEqual({ phase: "idle", hint: false });
    expect(holdProgress(holdStep(held, { type: "up", now: 1200 }), 1300)).toBe(0);
  });

  it("leaving the button or a cancelled pointer stops the hold; done stays done until reset", () => {
    const held = holdStep(IDLE, { type: "down", now: 0 });
    expect(holdStep(held, { type: "cancel" })).toEqual(IDLE);
    const done: HoldState = { phase: "done" };
    expect(holdStep(done, { type: "down", now: 10 })).toBe(done);
    expect(holdStep(done, { type: "up", now: 10 })).toBe(done);
    expect(holdStep(done, { type: "reset" })).toEqual(IDLE);
    expect(holdProgress(done, 0)).toBe(1);
  });
});
