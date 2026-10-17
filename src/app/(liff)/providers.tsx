"use client";

import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";

import { readLiffContext } from "@/lib/observability/liffContext";
import { RUM_PATH, rumPayload } from "@/lib/observability/rum";
import { registerServiceWorker } from "@/lib/pwa/register";

/** Web Vitals → `/bff/rum` with the route and the LIFF context only (`src/lib/observability/rum.ts`). */
function WebVitals() {
  useReportWebVitals((metric) => {
    const payload = rumPayload(metric, window.location.pathname, readLiffContext());
    if (!payload) return;
    const body = JSON.stringify(payload);
    if (!navigator.sendBeacon?.(RUM_PATH, new Blob([body], { type: "application/json" }))) {
      void fetch(RUM_PATH, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      }).catch(() => undefined);
    }
  });
  return null;
}

/**
 * Client-side providers of the one root layout: Web Vitals and the service worker. TanStack Query is not
 * mounted here (D-179): components that use queries wrap themselves in `QueryProvider` (`@/lib/api`), so
 * pages without a query do not ship it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(registerServiceWorker, []);
  return (
    <>
      <WebVitals />
      {children}
    </>
  );
}
