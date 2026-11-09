"use client";

import type { Client } from "openapi-fetch";

import { isNetworkFailure, networkError, problemFromParsed, problemFromResponse, type ApiError } from "./problem";
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

type TypedClient = Client<ApiPaths>;
type Verb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

let loading: Promise<TypedClient> | undefined;
function loadClient(): Promise<TypedClient> {
  loading ??= import("./client").then((module) => module.typedClient);
  // A failed fetch of the chunk (offline) is not cached, so the next call tries again.
  loading.catch(() => (loading = undefined));
  return loading;
}

// Warmed on the first tap or key press anywhere (as `lazyWarm` overlays are), so an action rarely waits for it.
const WARM_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;
function warm(): void {
  for (const type of WARM_EVENTS) window.removeEventListener(type, warm, true);
  loadClient().catch(() => undefined);
}
if (typeof window !== "undefined") {
  for (const type of WARM_EVENTS) window.addEventListener(type, warm, { capture: true, passive: true });
}

function verb<V extends Verb>(name: V): TypedClient[V] {
  return ((...args: unknown[]) =>
    loadClient().then((client) => (client[name] as (...init: unknown[]) => unknown)(...args))) as TypedClient[V];
}

/**
 * The typed client, loaded on first use (D-179, JS-ui): openapi-fetch and the generated operation list are ≈ 3.5 KB gz
 * that every page carried for the shell alone. Same methods and types as openapi-fetch's client (`client.ts`).
 */
export const browserApi: Pick<TypedClient, Verb> = {
  GET: verb("GET"),
  POST: verb("POST"),
  PUT: verb("PUT"),
  PATCH: verb("PATCH"),
  DELETE: verb("DELETE"),
};

/** openapi-fetch result → data or a thrown `ApiError` (what TanStack Query expects from a query function). */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.error === undefined) return result.data as T;
  throw problemFromParsed(result.response, result.error);
}

/**
 * A BFF call outside the typed client — for this app's own BFF routes (`/bff/auth/refresh`,
 * `/bff/auth/technician/refresh`) and the shell's calls made as a page opens (the realtime grant), which must not pull
 * the typed client into every page's initial JS. Other API operations go through the typed `browserApi`.
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
  let response: Response;
  try {
    response = await fetch(`${BFF_BASE}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (caught) {
    throw isNetworkFailure(caught) ? networkError() : caught;
  }
  if (!response.ok) throw await problemFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type { ApiError };
