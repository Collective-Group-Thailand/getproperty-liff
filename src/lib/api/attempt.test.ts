import { describe, expect, it, vi } from "vitest";

import { IdempotentAttempt } from "./attempt";
import { ApiError, networkError, NETWORK_UNAVAILABLE, toApiError } from "./problem";
import { isRefusal } from "./refusal";

describe("IdempotentAttempt (review M2: one key and one frozen body per logical action)", () => {
  const keys = () => {
    let n = 0;
    return () => `key-${++n}`;
  };

  it("repeats the key and the body built once while the intent is the same", async () => {
    const attempt = new IdempotentAttempt<{ at: number }>({ newKey: keys() });
    const build = vi.fn(() => ({ at: Math.random() }));
    const first = await attempt.prepare({ name: "A", hours: 2 }, build);
    attempt.failed(networkError());
    const retry = await attempt.prepare({ hours: 2, name: "A" }, build);
    expect(retry).toEqual(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("starts a new action when the intent changes, after success, and after idempotency.key_reused", async () => {
    const attempt = new IdempotentAttempt<string>({ newKey: keys() });
    expect((await attempt.prepare({ v: 1 }, () => "a")).key).toBe("key-1");
    expect((await attempt.prepare({ v: 2 }, () => "b")).key).toBe("key-2");
    attempt.succeeded();
    expect((await attempt.prepare({ v: 2 }, () => "b")).key).toBe("key-3");
    attempt.failed(new ApiError(422, { code: "idempotency.key_reused" }));
    expect((await attempt.prepare({ v: 2 }, () => "b")).key).toBe("key-4");
    attempt.failed(new ApiError(422, { code: "validation.failed" }));
    expect((await attempt.prepare({ v: 2 }, () => "b")).key).toBe("key-4");
  });

  it("lets a body with a time window expire (maxAgeMs)", async () => {
    let now = 0;
    const attempt = new IdempotentAttempt<number>({ newKey: keys(), maxAgeMs: 1000, now: () => now });
    expect(await attempt.prepare({}, () => now)).toEqual({ key: "key-1", body: 0 });
    now = 1000;
    expect(await attempt.prepare({}, () => now)).toEqual({ key: "key-1", body: 0 });
    now = 1001;
    expect(await attempt.prepare({}, () => now)).toEqual({ key: "key-2", body: 1001 });
  });

  it("does not keep an attempt whose body could not be built (a failed upload)", async () => {
    const attempt = new IdempotentAttempt<string>({ newKey: keys() });
    await expect(attempt.prepare({}, () => Promise.reject(new TypeError("Failed to fetch")))).rejects.toThrow();
    expect(attempt.key).toBeUndefined();
  });
});

describe("isRefusal (reviews L1–L3: when a retry is a new action)", () => {
  it("a 4xx refusal ends the action; a lost answer, 5xx, 408, 429 and in_progress keep the key", () => {
    expect(isRefusal(new ApiError(422, { code: "validation.failed" }))).toBe(true);
    expect(isRefusal(new ApiError(422, { code: "idempotency.key_reused" }))).toBe(true);
    expect(isRefusal(new ApiError(403, { code: "gate.resident_open_disabled" }))).toBe(true);
    expect(isRefusal(networkError())).toBe(false);
    expect(isRefusal(new ApiError(503, { code: "service.unavailable" }))).toBe(false);
    expect(isRefusal(new ApiError(408, { code: "request.timeout" }))).toBe(false);
    expect(isRefusal(new ApiError(429, { code: "rate_limited" }))).toBe(false);
    expect(isRefusal(new ApiError(409, { code: "idempotency.in_progress" }))).toBe(false);
  });
});

describe("toApiError (review M1)", () => {
  it("turns a network failure into network.unavailable and keeps API problems", () => {
    expect(toApiError(new TypeError("Failed to fetch")).code).toBe(NETWORK_UNAVAILABLE);
    expect(toApiError(new TypeError("Failed to fetch")).status).toBe(0);
    const problem = new ApiError(409, { code: "lease.invalid_state" });
    expect(toApiError(problem)).toBe(problem);
  });

  it("reports anything else to the page's error handlers and still gives the screen an error to show", () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const bug = new RangeError("bug");
    expect(toApiError(bug).code).toBe("client.unexpected");
    expect(report).toHaveBeenCalledWith(bug);
    vi.unstubAllGlobals();
  });
});
