import { NextResponse, type NextRequest } from "next/server";

import { apiBaseUrl, MOCK_SCENARIO_COOKIE, MOCK_SCENARIO_HEADER, upstreamFetch } from "@/lib/api/upstream";
import { parseCookieHeader, rewriteCookieHeader, SESSION_COOKIE_FLAGS } from "@/lib/auth/cookies";
import { PATHNAME_HEADER } from "@/lib/auth/redirects";
import { renewBeforeRender, sessionKindForPath } from "@/lib/auth/renew";
import { serverEnv } from "@/lib/env";
import { clientIpFrom, requestIdFrom } from "@/lib/http/edge";
import { contentSecurityPolicy, createNonce, originOf } from "@/lib/security/headers";

/**
 * Runs before every page (Next 16 proxy, Node runtime):
 *
 * 1. a fresh CSP nonce per request — Next reads it from the request's `Content-Security-Policy` header and
 *    stamps it on its scripts; the response carries the same policy (no `'unsafe-inline'` for scripts);
 * 2. the session's access token renewed before rendering when it is missing or about to expire (Server
 *    Components cannot set cookies);
 * 3. a request id and the path, for the guards and the API calls of the render.
 *
 * The other security headers (HSTS, noindex, Permissions-Policy, nosniff) come from `next.config.ts` for every
 * response, static files included. `/bff/*` is not matched: the BFF renews its own tokens.
 */
export async function proxy(request: NextRequest) {
  const env = serverEnv();
  const nonce = createNonce();
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV !== "production",
    extraConnect: [
      originOf(process.env.NEXT_PUBLIC_ASSET_BASE_URL),
      originOf(process.env.NEXT_PUBLIC_SENTRY_DSN),
    ].filter((o): o is string => !!o),
    extraImg: [originOf(process.env.NEXT_PUBLIC_ASSET_BASE_URL)].filter((o): o is string => !!o),
  });

  const requestHeaders = new Headers(request.headers);
  // A client-chosen id is not trusted (review L4): only a UUID passes, else this request gets its own.
  const requestId = requestIdFrom(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set(PATHNAME_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);

  let cookies: Awaited<ReturnType<typeof renewBeforeRender>> = [];
  if (request.method === "GET" && (env.API_INTERNAL_URL || env.API_MOCKS)) {
    const extra: Record<string, string> = { "x-request-id": requestId };
    const clientIp = clientIpFrom(request.headers, env.TRUSTED_HOPS);
    if (clientIp) extra["x-forwarded-for"] = clientIp;
    if (process.env.NEXT_PUBLIC_LIFF_MOCK === "1") {
      const scenario = parseCookieHeader(request.headers.get("cookie")).get(MOCK_SCENARIO_COOKIE);
      if (scenario) extra[MOCK_SCENARIO_HEADER] = scenario;
    }
    cookies = await renewBeforeRender({
      cookieHeader: request.headers.get("cookie"),
      kind: sessionKindForPath(request.nextUrl.pathname),
      apiBaseUrl: apiBaseUrl(),
      upstream: upstreamFetch,
      headers: extra,
    });
    if (cookies.length > 0) requestHeaders.set("cookie", rewriteCookieHeader(request.headers.get("cookie"), cookies));
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  // `response.cookies` (not a raw Set-Cookie header): Next also merges these into the cookies the render reads.
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, { ...SESSION_COOKIE_FLAGS, maxAge: cookie.maxAge });
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the BFF, the operations routes (`/api/healthz`, `/api/metrics`), Next's static files, the service worker, icons, fonts or the manifest.
      source:
        "/((?!bff|api/|_next/static|_next/image|sw\\.js|icons/|brand/|fonts/|favicon|icon\\.svg|manifest\\.webmanifest|offline\\.html).*)",
    },
  ],
};
