"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-reads the server-rendered page every `every` ms while the view is visible — the polite fallback behind realtime
 * (`unit:<id>` events) for screens where someone is waiting on someone else: an open SOS, a visitor at the gate.
 */
export function RefreshWhileVisible({ every }: { every: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => window.clearInterval(timer);
  }, [every, router]);
  return null;
}
