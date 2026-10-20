import { qk } from "@/lib/api/query-keys";

/**
 * Realtime events carry ids and a type only (contract §6); the client refetches through the API. This maps an
 * event type to the queries it makes stale — payment status first (L2's pay screen waits on `payment.*`; slip
 * decisions on `slip.*`). The API publishes billing events to the payer's `user:` and the invoice's `unit:`
 * channels (D-208); the open pay sheet keeps a slow poll only for a dropped stream.
 */
export function queriesFor(type: string): readonly (readonly string[])[] {
  if (type.startsWith("payment.")) return [qk.resident.payments(), qk.resident.invoices(), qk.resident.receipts()];
  if (type.startsWith("invoice.")) return [qk.resident.invoices()];
  if (type.startsWith("receipt.") || type.startsWith("tax_invoice.")) return [qk.resident.receipts()];
  if (type.startsWith("slip.")) return [qk.resident.allSlips(), qk.resident.invoices(), qk.resident.payments()];
  if (type.startsWith("notification.")) return [qk.resident.notifications()];
  if (type === "consent.changed" || type.startsWith("occupancy.") || type.startsWith("lease."))
    return [qk.resident.me()];
  return [];
}

/**
 * Server-rendered screens a realtime event makes stale (L4: requests, parcels, bookings, door codes are rendered
 * on the server, not cached in TanStack Query): when the resident is on one of these paths, the page is refreshed
 * (`router.refresh()`), keeping client state such as a half-written message. Prefixes; `/` is the home page only.
 */
export function routesFor(type: string): readonly string[] {
  // A new message re-reads only the open thread (`onRealtime`), not the whole page.
  if (type === MESSAGE_EVENT) return [];
  if (type.startsWith("service_request.")) return ["/requests", "/"];
  if (type.startsWith("parcel.")) return ["/parcels", "/"];
  if (type === "facility_booking.changed") return ["/facilities"];
  if (type.startsWith("access.credential_")) return ["/access"];
  return [];
}

/** A message on a request's thread (D-218): the resident, the office or the technician wrote. */
export const MESSAGE_EVENT = "service_request.message";

/**
 * Realtime events reach client components that keep their own state (the request thread) as a window event, so
 * the stream stays in one place (`RealtimeBridge`) and nothing else opens a connection.
 */
export const REALTIME_DOM_EVENT = "gp:realtime";
export interface RealtimeSignal {
  type: string;
}

export function signalRealtime(type: string, target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent<RealtimeSignal>(REALTIME_DOM_EVENT, { detail: { type } }));
}

/** Subscribes to realtime events of one type; returns the unsubscribe function. */
export function onRealtime(type: string, listener: () => void, target: EventTarget = window): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<RealtimeSignal>).detail?.type === type) listener();
  };
  target.addEventListener(REALTIME_DOM_EVENT, handler);
  return () => target.removeEventListener(REALTIME_DOM_EVENT, handler);
}

/** True when the current path is one of `routes` (`/` matches home only; others match the path and below). */
export function pathMatches(pathname: string, routes: readonly string[]): boolean {
  return routes.some((route) =>
    route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Reconnect delay after the n-th consecutive failure: 1 s, 2 s, 4 s … capped at 60 s, with jitter. */
export function backoff(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base / 2 + random() * (base / 2));
}
