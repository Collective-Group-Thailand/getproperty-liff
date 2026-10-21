"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { browserApi } from "@/lib/api/browser";
import { peekQueryClient } from "@/lib/api/query-runtime";
import { createRealtimeConnection } from "@/lib/realtime/connection";
import { backoff, pathMatches, queriesFor, routesFor, signalRealtime } from "@/lib/realtime/events";

/**
 * `SIGNED_OUT_EVENT` of `@/lib/auth/signOut`, repeated as a literal: that module is loaded only when the resident
 * signs out, and importing it here would put it in the shell (D-179 budget; the unit test pins the two together).
 */
export const SIGNED_OUT = "gp:signed-out";

/**
 * Server-sent events for the signed-in resident (contract §6): `POST /v1/resident/realtime/auth` (through the
 * BFF) authorises a 60-second stream — the token stays in an httpOnly cookie of the BFF, never in this URL (review
 * L5) — and the stream is read through the BFF, which delivers every event as a default message with its `type` in
 * the data (one listener, no list of event names in the shell — D-179); each event's type invalidates the matching
 * TanStack queries once a query client exists (ids only — the data is refetched). A dropped stream is re-authorised
 * with backoff; a hidden LIFF view closes it and reopens it when the resident comes back.
 *
 * **One stream at most** (review M5): every connection attempt takes a new generation number; an authorisation that
 * comes back after the view was hidden, after sign-out, after unmount or after a newer attempt started is dropped
 * without opening anything, and each stream's `onerror` closes that stream only. Signing out (`SIGNED_OUT`)
 * closes the stream and stops reconnecting.
 */
export function RealtimeBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const onEvent = (event: MessageEvent<string>) => {
      let type = event.type;
      try {
        const payload = JSON.parse(event.data) as { type?: unknown };
        if (typeof payload.type === "string") type = payload.type;
      } catch {
        // `ready`/`heartbeat` may carry no JSON type; the SSE event name is enough.
      }
      signalRealtime(type);
      // TanStack Query loads on demand (D-179): no client yet means nothing cached to invalidate.
      const queryClient = peekQueryClient();
      if (pathMatches(path.current, routesFor(type))) router.refresh();
      if (!queryClient) return;
      for (const queryKey of queriesFor(type)) void queryClient.invalidateQueries({ queryKey });
    };
    const connection = createRealtimeConnection({
      authorize: async () => {
        const { data } = await browserApi.POST("/v1/resident/realtime/auth").catch(() => ({ data: undefined }));
        return data ? `/bff${data.streamUrl}` : null;
      },
      open: (url) => new EventSource(url),
      onEvent,
      visible: () => document.visibilityState !== "hidden",
      delay: backoff,
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") connection.pause();
      else connection.resume();
    };
    const onSignedOut = () => connection.stop();

    connection.resume();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(SIGNED_OUT, onSignedOut);
    return () => {
      connection.stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(SIGNED_OUT, onSignedOut);
    };
  }, [router]);

  return null;
}
