"use client";

import { useEffect } from "react";

import { browserApi } from "@/lib/api/browser";
import { peekQueryClient } from "@/lib/api/query-runtime";
import { backoff, queriesFor } from "@/lib/realtime/events";

/** Named SSE events this app reacts to (contract §6; the API's event types, `src/core/events/event-types.ts`). */
const REALTIME_EVENTS = [
  "payment.confirmed",
  "payment.failed",
  "payment.reversed",
  "invoice.issued",
  "invoice.paid",
  "invoice.partially_paid",
  "invoice.balance_changed",
  "invoice.overdue",
  "invoice.voided",
  "receipt.issued",
  "receipt.voided",
  "tax_invoice.issued",
  "slip.review_requested",
  "slip.reviewed",
  "notification.created",
  "consent.changed",
] as const;

/**
 * Server-sent events for the signed-in resident (contract §6): `POST /v1/resident/realtime/auth` (through the
 * BFF) gives a 60-second stream token and URL; the stream is read through the BFF's streaming passthrough; each
 * event's type invalidates the matching TanStack queries once a query client exists (ids only — the data is
 * refetched). A dropped stream is
 * re-authorised with backoff; a hidden LIFF view closes it and reopens it when the resident comes back.
 */
export function RealtimeBridge() {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const onEvent = (event: MessageEvent<string>) => {
      let type = event.type;
      try {
        const payload = JSON.parse(event.data) as { type?: unknown };
        if (typeof payload.type === "string") type = payload.type;
      } catch {
        // `ready`/`heartbeat` may carry no JSON type; the SSE event name is enough.
      }
      // TanStack Query loads on demand (D-179): no client yet means nothing cached to invalidate.
      const queryClient = peekQueryClient();
      if (!queryClient) return;
      for (const queryKey of queriesFor(type)) void queryClient.invalidateQueries({ queryKey });
    };

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(connect, backoff(attempt));
      attempt += 1;
    };

    async function connect() {
      if (stopped || document.visibilityState === "hidden") return;
      const { data } = await browserApi.POST("/v1/resident/realtime/auth").catch(() => ({ data: undefined }));
      if (stopped) return;
      if (!data) return schedule();
      source = new EventSource(`/bff${data.streamUrl}`);
      source.addEventListener("ready", () => {
        attempt = 0;
      });
      source.onmessage = onEvent;
      for (const name of REALTIME_EVENTS) {
        source.addEventListener(name, onEvent as EventListener);
      }
      source.onerror = () => {
        source?.close();
        source = null;
        schedule();
      };
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        source?.close();
        source = null;
        clearTimeout(timer);
      } else if (!source) {
        attempt = 0;
        void connect();
      }
    };

    void connect();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
