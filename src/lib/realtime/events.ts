import { qk } from "@/lib/api/query-keys";

/**
 * Realtime events carry ids and a type only (contract §6); the client refetches through the API. This maps an
 * event type to the queries it makes stale — payment status first (L2's pay screen waits on `payment.*`; slip
 * decisions on `slip.*`). The resident's stream carries them once the API publishes billing events to `unit:`
 * channels (CONTRACT-REQUEST #16); until then the pay sheet also polls.
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

/** Reconnect delay after the n-th consecutive failure: 1 s, 2 s, 4 s … capped at 60 s, with jitter. */
export function backoff(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base / 2 + random() * (base / 2));
}
