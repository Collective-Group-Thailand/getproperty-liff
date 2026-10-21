import { safeInternalPath } from "@/lib/liff/deepLink";

import { clearedCookies, parseCookieHeader, SESSION_COOKIES, sessionCookies, type CookieToSet } from "./cookies";
import { refreshRejected, refreshTokens } from "./refresh";

/**
 * A party linked after the access token was issued (D-226: the Owner confirmed a phone match; also a move-in that
 * began since the last refresh) is in `/v1/resident/me` at once — the API reads the links — but its `unit:` /
 * `lease:` scopes arrive only with the next token, and until then the unit's bills, lease and door codes answer
 * 404. The resident layout notices the gap (`scopesStale`) and sends the browser through `/auth/rescope`, which
 * rotates the session and comes straight back. A short-lived marker cookie stops a second round trip if the API's
 * token still lacks a scope (never a loop).
 *
 * Framework-free: the guard, the route handler and the tests share it.
 */
export const RESCOPE_COOKIE = "gp_rescoped";
/** Seconds the marker lives: one rotation per half minute at most. */
export const RESCOPE_MARKER_SECONDS = 30;
export const RESCOPE_PATH = "/auth/rescope";

/** True when `/me` lists a unit or a lease the token's scopes do not cover yet. */
export function scopesStale(me: {
  scopes: readonly string[];
  units: readonly { unitId: string }[];
  leaseIds: readonly string[];
}): boolean {
  const held = new Set(me.scopes);
  return (
    me.units.some((unit) => !held.has(`unit:${unit.unitId}`)) || me.leaseIds.some((id) => !held.has(`lease:${id}`))
  );
}

export function rescopePath(next: string): string {
  return `${RESCOPE_PATH}?next=${encodeURIComponent(safeInternalPath(next))}`;
}

/**
 * The rotation behind `/auth/rescope`: the session cookies to write (new pair; cleared when the API refuses the
 * refresh token; none when the API is unreachable or there is no session) plus the marker.
 */
export async function rescopeSession(options: {
  cookieHeader: string | null;
  apiBaseUrl: string;
  upstream: (request: Request) => Promise<Response>;
  headers?: Record<string, string>;
  now?: number;
}): Promise<CookieToSet[]> {
  const now = options.now ?? Date.now();
  const marker: CookieToSet = { name: RESCOPE_COOKIE, value: "1", maxAge: RESCOPE_MARKER_SECONDS };
  const refresh = parseCookieHeader(options.cookieHeader).get(SESSION_COOKIES.resident.refresh);
  if (!refresh) return [marker];
  const outcome = await refreshTokens(options.apiBaseUrl, refresh, options.upstream, options.headers ?? {}, () => now);
  if (outcome.ok) return [...sessionCookies("resident", outcome.pair, now), marker];
  if (refreshRejected(outcome)) return [...clearedCookies("resident"), marker];
  return [marker];
}
