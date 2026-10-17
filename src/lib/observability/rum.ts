import type { LiffContext } from "./liffContext";

/**
 * Web Vitals RUM (L1 1.3 §5): the browser posts each metric to `/bff/rum` with the route (ids replaced), the
 * LIFF context (in LINE or not, OS) and nothing about the person — no id token, LINE id, profile, query string
 * or invitation code. The server checks it (`rumSchema.ts`) and logs one structured line for the log pipeline.
 * No schema library here: this file is in every page's initial JS.
 */
export const RUM_PATH = "/bff/rum";
export const METRIC_NAMES = ["CLS", "FCP", "FID", "INP", "LCP", "TTFB"] as const;
export const RATINGS = ["good", "needs-improvement", "poor"] as const;

export interface RumPayload {
  name: (typeof METRIC_NAMES)[number];
  value: number;
  rating?: (typeof RATINGS)[number];
  navigationType?: string;
  route: string;
  inClient: boolean | null;
  os: string | null;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** `/invoices/0199…/pay?x=1` → `/invoices/:id/pay`: no ids, no query, no fragment. */
export function routeOf(pathname: string): string {
  const bare = pathname.split(/[?#]/)[0] ?? "/";
  return (
    bare
      .replace(UUID, ":id")
      .split("/")
      .map((segment) => (/^\d{3,}$/.test(segment) || /^[A-Z0-9-]{8,}$/.test(segment) ? ":id" : segment))
      .join("/") || "/"
  );
}

export function rumPayload(
  metric: { name: string; value: number; rating?: string; navigationType?: string },
  pathname: string,
  context: LiffContext | null,
): RumPayload | null {
  if (!(METRIC_NAMES as readonly string[]).includes(metric.name)) return null;
  if (!Number.isFinite(metric.value) || metric.value < 0) return null;
  const route = routeOf(pathname).slice(0, 200);
  return {
    name: metric.name as RumPayload["name"],
    value: Math.round(metric.value * 1000) / 1000,
    ...((RATINGS as readonly string[]).includes(metric.rating ?? "")
      ? { rating: metric.rating as RumPayload["rating"] }
      : {}),
    ...(metric.navigationType ? { navigationType: metric.navigationType.slice(0, 32) } : {}),
    route,
    inClient: context?.inClient ?? null,
    os: context?.os?.slice(0, 16) ?? null,
  };
}
