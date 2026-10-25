/**
 * Session cookies (ADR-0006). Tokens live only here: httpOnly, `Secure`, `SameSite=Lax`, `__Host-` prefixed
 * (host-only, `Path=/`, never a `Domain`), so neither page scripts nor another getproperty host can read or
 * plant them — an owner/staff cookie of getproperty-web has another name on another host and is never sent
 * here. Residents, technicians (R2) and prospects (L5) have separate pairs, so one person can be all three.
 *
 * Framework-free: the proxy, the BFF and the tests share it.
 */
export type SessionKind = "resident" | "technician" | "prospect";

export const SESSION_COOKIES: Record<SessionKind, { access: string; refresh: string }> = {
  resident: { access: "__Host-gp_at", refresh: "__Host-gp_rt" },
  technician: { access: "__Host-gp_tat", refresh: "__Host-gp_trt" },
  /** People asking about a listing or booking a viewing (L5, D-281): an audience and a cookie pair of their own. */
  prospect: { access: "__Host-gp_pat", refresh: "__Host-gp_prt" },
};

/** The unit the resident picked in the header (not a secret: it only chooses among their own units). */
export const UNIT_COOKIE = "gp_unit";

export interface CookieToSet {
  name: string;
  value: string;
  /** Seconds; 0 deletes. */
  maxAge: number;
}

export interface TokenPairLike {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

const secondsUntil = (iso: string, now: number) => Math.max(0, Math.floor((Date.parse(iso) - now) / 1000));

export function sessionCookies(kind: SessionKind, pair: TokenPairLike, now: number = Date.now()): CookieToSet[] {
  const names = SESSION_COOKIES[kind];
  return [
    { name: names.access, value: pair.accessToken, maxAge: secondsUntil(pair.accessTokenExpiresAt, now) },
    { name: names.refresh, value: pair.refreshToken, maxAge: secondsUntil(pair.refreshTokenExpiresAt, now) },
  ];
}

export function clearedCookies(kind: SessionKind): CookieToSet[] {
  const names = SESSION_COOKIES[kind];
  return [
    { name: names.access, value: "", maxAge: 0 },
    { name: names.refresh, value: "", maxAge: 0 },
  ];
}

/** The flags of every session cookie, for APIs that take options (`NextResponse.cookies`). */
export const SESSION_COOKIE_FLAGS = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;

/** `Set-Cookie` value with the flags every session cookie carries. */
export function serializeCookie({ name, value, maxAge }: CookieToSet): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax"];
  parts.push(`Max-Age=${maxAge}`);
  if (maxAge === 0) parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  return parts.join("; ");
}

/** Parses a `Cookie` request header. */
export function parseCookieHeader(header: string | null | undefined): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try {
      jar.set(name, decodeURIComponent(raw));
    } catch {
      jar.set(name, raw);
    }
  }
  return jar;
}

/** Rebuilds a `Cookie` header with some cookies replaced or removed (empty value = removed). */
export function rewriteCookieHeader(header: string | null | undefined, changes: CookieToSet[]): string {
  const jar = parseCookieHeader(header);
  for (const change of changes) {
    if (change.maxAge === 0 || change.value === "") jar.delete(change.name);
    else jar.set(change.name, change.value);
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}

export interface AccessClaims {
  exp?: number;
  aud?: string | string[];
  sid?: string;
  sub?: string;
}

/**
 * Reads the access token's payload **without verifying it** — only to decide when to refresh and which audience
 * a cookie holds. The API verifies every token; nothing here is trusted for authorisation.
 */
export function readAccessClaims(token: string | undefined): AccessClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const binary = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object" ? (claims as AccessClaims) : null;
  } catch {
    return null;
  }
}

/** True when the access token is missing, unreadable or expires within `skewSeconds`. */
export function accessTokenStale(token: string | undefined, now: number = Date.now(), skewSeconds = 30): boolean {
  const claims = readAccessClaims(token);
  if (!claims || typeof claims.exp !== "number") return true;
  return claims.exp * 1000 - now <= skewSeconds * 1000;
}
