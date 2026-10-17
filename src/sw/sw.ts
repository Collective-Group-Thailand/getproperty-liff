/// <reference lib="webworker" />
/**
 * getproperty-liff service worker (built by `scripts/build-sw.ts` into `public/sw.js`). App-shell caching only
 * (`src/lib/pwa/cachePolicy.ts`): hashed static assets cache-first, page navigations always from the network
 * with a static offline page as the fallback — no resident data is ever stored offline. Web push (VAPID) shows
 * the API's notification and opens its deep link inside the app.
 */
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";

import { cacheDecision, OFFLINE_URL, SHELL_CACHE } from "../lib/pwa/cachePolicy";
import { safeInternalPath } from "../lib/liff/deepLink";

declare const self: ServiceWorkerGlobalScope;

void self.skipWaiting();
clientsClaim();

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("gp-") && key !== SHELL_CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
});

registerRoute(
  ({ url, request }) => cacheDecision(url, self.location.origin, request.mode) === "static",
  new CacheFirst({
    cacheName: SHELL_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true })],
  }),
);

registerRoute(
  ({ url, request }) => cacheDecision(url, self.location.origin, request.mode) === "offline-fallback",
  new NetworkOnly(),
);

setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") {
    const offline = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    if (offline) return offline;
  }
  return Response.error();
});

self.addEventListener("push", (event) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "getproperty", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: safeInternalPath(payload.url ?? "/") },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeInternalPath((event.notification.data as { url?: string } | null)?.url ?? "/");
  event.waitUntil(self.clients.openWindow(target));
});
