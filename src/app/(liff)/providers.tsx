"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useState } from "react";

import { createQueryClient } from "@/lib/api/query";
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

/** Client-side providers of the one root layout: TanStack Query, Web Vitals, the service worker. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  useEffect(registerServiceWorker, []);
  return (
    <QueryClientProvider client={queryClient}>
      <WebVitals />
      {children}
    </QueryClientProvider>
  );
}
