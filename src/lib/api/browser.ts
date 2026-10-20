"use client";

import createClient from "openapi-fetch";

import { needsIdempotencyKey, newIdempotencyKey } from "./idempotency";
import { problemFromParsed, problemFromResponse, type ApiError } from "./problem";
import type { ApiPaths } from "./types";

/**
 * The API client for Client Components (master plan §4): typed by the contract, sent to this app's BFF
 * (`/bff/v1/...`), which adds the session from the httpOnly cookie. Every non-GET carries the CSRF header the
 * BFF requires; operations the contract flags get an `Idempotency-Key` unless the caller passed one (a retry of
 * the same action must reuse its key — pass it explicitly then).
 */
export const BFF_BASE = "/bff";
export const CSRF_HEADERS = { "x-getproperty-csrf": "1" } as const;

function documentLanguage(): string | undefined {
  return typeof document === "undefined" ? undefined : document.documentElement.lang || undefined;
}

/** The page's language (the middleware below sends it as `Accept-Language` on every call). */
export function acceptLanguage(): string {
  return documentLanguage() ?? "th";
}

export const browserApi = createClient<ApiPaths>({ baseUrl: BFF_BASE, credentials: "same-origin" });

browserApi.use({
  onRequest({ request }) {
    const path = new URL(request.url, "http://local").pathname.replace(/^\/bff/, "");
    if (request.method !== "GET" && request.method !== "HEAD") {
      request.headers.set("x-getproperty-csrf", "1");
      if (needsIdempotencyKey(request.method, path) && !request.headers.has("idempotency-key")) {
        request.headers.set("idempotency-key", newIdempotencyKey());
      }
    }
    const language = documentLanguage();
    if (language && !request.headers.has("accept-language")) request.headers.set("accept-language", language);
    return request;
  },
});

/** openapi-fetch result → data or a thrown `ApiError` (what TanStack Query expects from a query function). */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.error === undefined) return result.data as T;
  throw problemFromParsed(result.response, result.error);
}

/**
 * A BFF call outside the typed client — for this app's own BFF routes (`/bff/auth/refresh`) and, should one be
 * needed again, an endpoint the contract does not publish yet (marked `CONTRACT-REQUEST`, docs/contract-requests.md).
 */
export async function bffJson<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers = new Headers({ accept: "application/json" });
  const language = documentLanguage();
  if (language) headers.set("accept-language", language);
  if (method !== "GET") {
    headers.set("x-getproperty-csrf", "1");
    headers.set("content-type", "application/json");
  }
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  const response = await fetch(`${BFF_BASE}${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw await problemFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type { ApiError };
