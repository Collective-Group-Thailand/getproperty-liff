import { describe, expect, it } from "vitest";

import {
  DEFAULT_RETRY_SECONDS,
  OPENING_MS,
  canPress,
  parseRetryAfter,
  retryIn,
  step,
  type OpenState,
} from "./gateOpen";

const idle: OpenState = { kind: "idle" };

describe("open barrier state machine", () => {
  it("sends at once, or asks for the location first only when the estate requires it", () => {
    expect(step(idle, { type: "press", requireGeofence: false })).toEqual({ kind: "sending" });
    const locating = step(idle, { type: "press", requireGeofence: true });
    expect(locating).toEqual({ kind: "locating" });
    expect(step(locating, { type: "located" })).toEqual({ kind: "sending" });
    expect(step(locating, { type: "locationError", denied: true })).toEqual({ kind: "location_denied" });
    expect(step(locating, { type: "locationError", denied: false })).toEqual({ kind: "location_unavailable" });
  });

  it("202 → opening for a moment → sent; a press while busy is ignored", () => {
    const opening = step({ kind: "sending" }, { type: "accepted", now: 1000 });
    expect(opening).toEqual({ kind: "opening", until: 1000 + OPENING_MS });
    expect(step(opening, { type: "press", requireGeofence: false })).toBe(opening);
    expect(step(opening, { type: "tick", now: 1000 + OPENING_MS - 1 })).toBe(opening);
    expect(step(opening, { type: "tick", now: 1000 + OPENING_MS })).toEqual({ kind: "sent", at: 1000 + OPENING_MS });
    expect(canPress(opening, 0)).toBe(false);
    expect(canPress({ kind: "sent", at: 0 }, 0)).toBe(true);
  });

  it("429 waits Retry-After seconds (default when absent), then frees the button", () => {
    const limited = step(
      { kind: "sending" },
      { type: "problem", status: 429, code: "gate.open_rate_limited", retryAfterSeconds: 3, now: 0 },
    );
    expect(limited).toEqual({ kind: "rate_limited", retryAt: 3000 });
    expect(retryIn(limited, 1200)).toBe(2);
    expect(canPress(limited, 2999)).toBe(false);
    expect(step(limited, { type: "tick", now: 3000 })).toEqual(idle);
    expect(step({ kind: "sending" }, { type: "problem", status: 429, code: "http.too_many_requests", now: 0 })).toEqual(
      {
        kind: "rate_limited",
        retryAt: DEFAULT_RETRY_SECONDS * 1000,
      },
    );
  });

  it("maps the API's refusals", () => {
    const p = (status: number, code: string) =>
      step({ kind: "sending" }, { type: "problem", status, code, now: 0, requestId: "r1" });
    expect(p(403, "gate.resident_open_disabled")).toEqual({ kind: "not_allowed" });
    expect(p(404, "http.not_found")).toEqual({ kind: "not_allowed" });
    expect(p(403, "gate.outside_geofence")).toEqual({ kind: "outside" });
    expect(p(409, "gate.geofence_unavailable")).toEqual({ kind: "no_estate_location" });
    expect(p(409, "gate.no_barrier")).toEqual({ kind: "no_barrier" });
    expect(p(0, "network.unavailable")).toEqual({ kind: "failed", requestId: "r1" });
    expect(canPress({ kind: "not_allowed" }, 0)).toBe(false);
    expect(canPress({ kind: "outside" }, 0)).toBe(true);
  });

  it("reads Retry-After as seconds or a date", () => {
    expect(parseRetryAfter("3", 0)).toBe(3);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 1000)).toBe(9);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("soon", 0)).toBeNull();
  });
});
