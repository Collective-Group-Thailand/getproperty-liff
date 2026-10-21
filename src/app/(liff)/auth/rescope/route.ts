import { apiBaseUrl, MOCK_SCENARIO_COOKIE, MOCK_SCENARIO_HEADER, upstreamFetch } from "@/lib/api/upstream";
import { parseCookieHeader, serializeCookie } from "@/lib/auth/cookies";
import { rescopeSession } from "@/lib/auth/rescope";
import { safeInternalPath } from "@/lib/liff/deepLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `GET /auth/rescope?next=<path>` (`src/lib/auth/rescope.ts`): rotates the resident session so the token carries the
 * scopes of parties linked since it was issued (D-226), then sends the browser back to `next` (an in-app path only).
 * The resident layout sends a page here when `/me` lists a unit or lease the token does not cover. A cross-site
 * navigation is sent on without rotating anything.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeInternalPath(url.searchParams.get("next"));
  const headers = new Headers({ location: next, "cache-control": "no-store" });
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 303, headers });

  const cookieHeader = request.headers.get("cookie");
  const upstreamHeaders: Record<string, string> = {};
  const requestId = request.headers.get("x-request-id");
  if (requestId) upstreamHeaders["x-request-id"] = requestId;
  // Mock builds only (inlined; dropped from production bundles): the e2e scenario travels to the MSW handlers.
  if (process.env.NEXT_PUBLIC_LIFF_MOCK === "1") {
    const scenario = parseCookieHeader(cookieHeader).get(MOCK_SCENARIO_COOKIE);
    if (scenario) upstreamHeaders[MOCK_SCENARIO_HEADER] = scenario;
  }
  const cookies = await rescopeSession({
    cookieHeader,
    apiBaseUrl: apiBaseUrl(),
    upstream: upstreamFetch,
    headers: upstreamHeaders,
  });
  for (const cookie of cookies) headers.append("set-cookie", serializeCookie(cookie));
  return new Response(null, { status: 303, headers });
}
