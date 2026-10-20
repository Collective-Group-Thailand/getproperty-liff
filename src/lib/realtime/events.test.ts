import { describe, expect, it } from "vitest";

import { backoff, MESSAGE_EVENT, onRealtime, pathMatches, queriesFor, routesFor, signalRealtime } from "./events";

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

  it("maps invoice, receipt and slip events (L2)", () => {
    expect(queriesFor("invoice.paid")).toEqual([["resident", "invoices"]]);
    expect(queriesFor("invoice.balance_changed")).toEqual([["resident", "invoices"]]);
    expect(queriesFor("tax_invoice.issued")).toEqual([["resident", "receipts"]]);
    expect(queriesFor("slip.reviewed")).toEqual([
      ["resident", "slips"],
      ["resident", "invoices"],
      ["resident", "payments"],
    ]);
  });

  it("refreshes the server-rendered R2 screens an event touches (L4)", () => {
    expect(routesFor("service_request.changed")).toEqual(["/requests", "/"]);
    expect(routesFor("parcel.received")).toContain("/parcels");
    expect(routesFor("facility_booking.changed")).toEqual(["/facilities"]);
    expect(routesFor("access.credential_revoked")).toEqual(["/access"]);
    expect(routesFor("invoice.paid")).toEqual([]);
    // A thread message re-reads the thread only (D-218), never the whole request page.
    expect(routesFor(MESSAGE_EVENT)).toEqual([]);
    expect(pathMatches("/requests/3b24", ["/requests"])).toBe(true);
    expect(pathMatches("/requestsx", ["/requests"])).toBe(false);
    expect(pathMatches("/", ["/"])).toBe(true);
    expect(pathMatches("/parcels", ["/"])).toBe(false);
  });

  it("backs off exponentially up to a minute", () => {
    expect(backoff(0, () => 0)).toBe(500);
    expect(backoff(3, () => 1)).toBe(8000);
    expect(backoff(20, () => 1)).toBe(60_000);
  });
});

describe("realtime signals to client components", () => {
  it("delivers only the subscribed event type, until unsubscribed", () => {
    const target = new EventTarget();
    const seen: string[] = [];
    const off = onRealtime(MESSAGE_EVENT, () => seen.push("message"), target);
    signalRealtime("service_request.changed", target);
    signalRealtime(MESSAGE_EVENT, target);
    off();
    signalRealtime(MESSAGE_EVENT, target);
    expect(seen).toEqual(["message"]);
  });
});
