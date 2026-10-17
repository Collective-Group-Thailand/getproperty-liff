import "server-only";

import createClient, { type Client } from "openapi-fetch";
import { cookies, headers } from "next/headers";

import { SESSION_COOKIES, type SessionKind } from "@/lib/auth/cookies";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/i18n/routing";

import { problemFromParsed, type ApiError } from "./problem";
import type { ApiPaths } from "./types";
import { apiBaseUrl, MOCK_SCENARIO_COOKIE, MOCK_SCENARIO_HEADER, upstreamFetch } from "./upstream";

/**
 * The API client for Server Components and server actions (master plan §4): `API_INTERNAL_URL`, the bearer of
 * the session cookie, `Accept-Language` from the resident's locale and the request id the proxy assigned. A
 * Server Component cannot rewrite cookies, so it never refreshes: the proxy (`src/proxy.ts`) renews the access
 * token before the page renders, and a 401 here means "signed out" (`getActor`).
 */
export async function serverApi(kind: SessionKind = "resident"): Promise<Client<ApiPaths>> {
  const [jar, incoming] = await Promise.all([cookies(), headers()]);
  const access = jar.get(SESSION_COOKIES[kind].access)?.value;
  const cookieLocale = jar.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const requestId = incoming.get("x-request-id") ?? crypto.randomUUID();
  const scenario = process.env.NEXT_PUBLIC_LIFF_MOCK === "1" ? jar.get(MOCK_SCENARIO_COOKIE)?.value : undefined;

  const client = createClient<ApiPaths>({ baseUrl: apiBaseUrl(), fetch: upstreamFetch });
  client.use({
    onRequest({ request }) {
      if (access) request.headers.set("authorization", `Bearer ${access}`);
      if (!request.headers.has("accept-language")) request.headers.set("accept-language", locale);
      request.headers.set("x-request-id", requestId);
      const ua = incoming.get("user-agent");
      if (ua) request.headers.set("user-agent", ua);
      if (scenario) request.headers.set(MOCK_SCENARIO_HEADER, scenario);
      return request;
    },
  });
  return client;
}

/** True when this browser holds a session of that kind (an access or a refresh cookie). */
export async function hasSessionCookie(kind: SessionKind = "resident"): Promise<boolean> {
  const jar = await cookies();
  return jar.has(SESSION_COOKIES[kind].access) || jar.has(SESSION_COOKIES[kind].refresh);
}

/**
 * A server-side call outside the typed client — only for endpoints the contract does not publish yet, each marked
 * `CONTRACT-REQUEST` at the call site (docs/contract-requests.md, `src/lib/api/contract-requests.ts`). Same headers
 * as `serverApi()`; resolves with the parsed body or an `ApiError`.
 */
export async function serverJson<T>(
  path: string,
  kind: SessionKind = "resident",
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: ApiError }> {
  const client = await serverApi(kind);
  const { data, error, response } = await (
    client as unknown as {
      GET: (p: string) => Promise<{ data?: unknown; error?: unknown; response: Response }>;
    }
  ).GET(path);
  if (response.ok && error === undefined) return { data: data as T };
  return { error: problemFromParsed(response, error) };
}
