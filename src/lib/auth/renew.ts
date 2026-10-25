import {
  accessTokenStale,
  clearedCookies,
  parseCookieHeader,
  SESSION_COOKIES,
  sessionCookies,
  type CookieToSet,
  type SessionKind,
} from "./cookies";
import { refreshRejected, refreshTokens } from "./refresh";

/**
 * Renews the access token **before a page renders** (the proxy, ADR-0006): Server Components cannot write
 * cookies, so a token that is missing or about to expire is rotated here, the new cookies are put on the
 * incoming request (the render sees them) and on the response (the browser keeps them). A refresh token the API
 * rejects ends the session (cookies cleared); an unreachable API leaves the cookies alone.
 */
export async function renewBeforeRender(options: {
  cookieHeader: string | null;
  kind: SessionKind;
  apiBaseUrl: string;
  upstream: (request: Request) => Promise<Response>;
  headers?: Record<string, string>;
  now?: number;
}): Promise<CookieToSet[]> {
  const now = options.now ?? Date.now();
  const jar = parseCookieHeader(options.cookieHeader);
  const names = SESSION_COOKIES[options.kind];
  const refresh = jar.get(names.refresh);
  if (!refresh || !accessTokenStale(jar.get(names.access), now, 60)) return [];
  const outcome = await refreshTokens(options.apiBaseUrl, refresh, options.upstream, options.headers ?? {}, () => now);
  if (outcome.ok) return sessionCookies(options.kind, outcome.pair, now);
  if (refreshRejected(outcome)) return clearedCookies(options.kind);
  return [];
}

export function sessionKindForPath(pathname: string): SessionKind {
  if (/^\/technician(\/|$)/.test(pathname)) return "technician";
  return /^\/rent(\/|$)/.test(pathname) ? "prospect" : "resident";
}
