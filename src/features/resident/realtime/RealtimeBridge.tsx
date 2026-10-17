"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { browserApi } from "@/lib/api/browser";
import { backoff, queriesFor } from "@/lib/realtime/events";

/**
 * Server-sent events for the signed-in resident (contract §6): `POST /v1/resident/realtime/auth` (through the
 * BFF) gives a 60-second stream token and URL; the stream is read through the BFF's streaming passthrough; each
 * event's type invalidates the matching TanStack queries (ids only — the data is refetched). A dropped stream is
 * re-authorised with backoff; a hidden LIFF view closes it and reopens it when the resident comes back.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();

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
      for (const name of [
        "payment.confirmed",
        "payment.failed",
        "invoice.issued",
        "invoice.paid",
        "receipt.issued",
        "notification.created",
        "consent.changed",
      ]) {
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
  }, [queryClient]);

  return null;
}
