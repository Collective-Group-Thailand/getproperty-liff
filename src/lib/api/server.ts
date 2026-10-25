import "server-only";

import createClient, { type Client } from "openapi-fetch";
import { cookies, headers } from "next/headers";

import { LANDLORD_TENANT_COOKIE, SESSION_COOKIES, type SessionKind } from "@/lib/auth/cookies";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/i18n/routing";
import { requestIdFrom } from "@/lib/http/edge";

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
  const tenantId = kind === "landlord" ? jar.get(LANDLORD_TENANT_COOKIE)?.value : undefined;
  const cookieLocale = jar.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  // The proxy already replaced a non-UUID id (review L4); checked again for renders it did not run for.
  const requestId = requestIdFrom(incoming);
  const scenario = process.env.NEXT_PUBLIC_LIFF_MOCK === "1" ? jar.get(MOCK_SCENARIO_COOKIE)?.value : undefined;

  const client = createClient<ApiPaths>({ baseUrl: apiBaseUrl(), fetch: upstreamFetch });
  client.use({
    onRequest({ request }) {
      if (access) request.headers.set("authorization", `Bearer ${access}`);
      if (tenantId) request.headers.set("x-tenant-id", tenantId);
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
