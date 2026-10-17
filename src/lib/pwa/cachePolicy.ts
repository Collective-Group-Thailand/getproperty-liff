/**
 * What the service worker may cache (L1 1.3 §4): the **app shell only** — Next's hashed static assets, fonts,
 * icons and the offline page. Never pages (they carry the resident's name and units), never `/bff/*` (invoices,
 * receipts, personal data), never anything cross-origin (signed object-storage URLs, LINE).
 */
export type CacheDecision = "static" | "offline-fallback" | "network-only";

export function cacheDecision(url: URL, selfOrigin: string, mode: RequestMode | undefined): CacheDecision {
  if (url.origin !== selfOrigin) return "network-only";
  if (url.pathname.startsWith("/bff/")) return "network-only";
  if (mode === "navigate") return "offline-fallback";
  if (url.pathname.startsWith("/_next/static/")) return "static";
  if (/^\/(icons|brand|fonts)\//.test(url.pathname) || url.pathname === "/offline.html") return "static";
  return "network-only";
}

export const OFFLINE_URL = "/offline.html";
export const SHELL_CACHE = "gp-shell-v1";
