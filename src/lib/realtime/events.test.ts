import { describe, expect, it } from "vitest";

import { backoff, queriesFor } from "./events";

describe("realtime → query invalidation", () => {
  it("maps payment status events to payments, invoices and receipts", () => {
    expect(queriesFor("payment.confirmed")).toEqual([
      ["resident", "payments"],
      ["resident", "invoices"],
      ["resident", "receipts"],
    ]);
    expect(queriesFor("notification.created")).toEqual([["resident", "notifications"]]);
    expect(queriesFor("heartbeat")).toEqual([]);
  });

  it("backs off exponentially up to a minute", () => {
    expect(backoff(0, () => 0)).toBe(500);
    expect(backoff(3, () => 1)).toBe(8000);
    expect(backoff(20, () => 1)).toBe(60_000);
  });
});
