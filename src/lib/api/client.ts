"use client";

import createClient from "openapi-fetch";

import { needsIdempotencyKey, newIdempotencyKey } from "./idempotency";
import { isNetworkFailure, networkError } from "./problem";
import type { ApiPaths } from "./types";

/**
 * The typed client itself (openapi-fetch + the generated operation list for `Idempotency-Key`). Never imported
 * statically outside `browser.ts`: `browserApi` loads this module on its first call (or the first tap / key press on
 * the page), so a page that is only looked at never downloads it (D-179, JS-ui).
 */
export const typedClient = createClient<ApiPaths>({ baseUrl: "/bff", credentials: "same-origin" });

typedClient.use({
  onRequest({ request }) {
    const path = new URL(request.url, "http://local").pathname.replace(/^\/bff/, "");
    if (request.method !== "GET" && request.method !== "HEAD") {
      request.headers.set("x-getproperty-csrf", "1");
      if (needsIdempotencyKey(request.method, path) && !request.headers.has("idempotency-key")) {
        request.headers.set("idempotency-key", newIdempotencyKey());
      }
    }
    const language = typeof document === "undefined" ? undefined : document.documentElement.lang || undefined;
    if (language && !request.headers.has("accept-language")) request.headers.set("accept-language", language);
    return request;
  },
  // A dropped connection makes `fetch` reject with a TypeError: thrown as an `ApiError` (`network.unavailable`, status
  // 0) so every screen's catch shows "No connection — try again" instead of an unhandled rejection (review M1).
  onError({ error }) {
    if (isNetworkFailure(error)) return networkError();
  },
});
