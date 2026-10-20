import {
  accessTokenStale,
  clearedCookies,
  parseCookieHeader,
  serializeCookie,
  SESSION_COOKIES,
  sessionCookies,
  type CookieToSet,
  type SessionKind,
  type TokenPairLike,
} from "@/lib/auth/cookies";
import { refreshRejected, refreshTokens } from "@/lib/auth/refresh";

/**
 * The resident BFF (master plan §4, ADR-0006): the browser's only way to the API.
 *
 *   /bff/v1/<allow-listed path>     passthrough with the session's bearer
 *   /bff/auth/line                  LIFF id token → `/v1/auth/resident/line` → cookies
 *   /bff/auth/technician/line       same for technicians (FEATURE_TECHNICIAN=1)
 *   /bff/auth/logout                `/v1/auth/logout` for every session of this browser, cookies cleared
 *   /bff/auth/refresh               rotate the resident session now (POST) — after `/v1/resident/link` answers
 *                                   `refreshRequired`, so the new `lease:`/`unit:` scopes arrive (D-061)
 *   /bff/auth/technician/refresh    rotate the technician session now (POST) — a work order assigned after sign-in
 *                                   arrives with the next token's `work_order:` scopes (D-210)
 *
 * Rules: allow-list (`/v1/resident`, `/v1/auth/resident`; `/v1/technician`, `/v1/auth/technician` with the
 * technician flag) — `/v1/owner`, `/v1/staff`, `/v1/admin`, `/v1/device` and everything else 404; bearer from the
 * httpOnly cookie, refreshed before it expires and **once** on a 401, rotated cookies always written back; tokens
 * in auth responses become cookies and never reach the browser; same-origin + `x-getproperty-csrf: 1` on every
 * non-GET; request bodies capped (photos and slips go to object storage by presigned URL); responses streamed
 * (PDF, SSE) and never cached.
 */
export interface BffConfig {
  apiBaseUrl: string;
  upstream: (request: Request) => Promise<Response>;
  technicianEnabled: boolean;
  /** Public origin of this app; derived from the request when unset. */
  appOrigin?: string;
  maxBodyBytes?: number;
  now?: () => number;
  /** Extra headers for every upstream call (the mock scenario in mock builds). */
  upstreamHeaders?: (request: Request) => Record<string, string>;
}

export const CSRF_HEADER = "x-getproperty-csrf";
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "idempotency-key",
  "if-match",
  "if-none-match",
  "last-event-id",
  "user-agent",
  "traceparent",
  "tracestate",
];

const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "content-language",
  "etag",
  "x-request-id",
  "retry-after",
  "idempotent-replayed",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
];

type Route =
  | { type: "proxy"; path: string; kind: SessionKind; auth: boolean }
  | { type: "exchange"; path: string; kind: SessionKind }
  | { type: "logout" }
  | { type: "refresh"; kind: SessionKind };

function problem(status: number, code: string, detail: string, requestId: string, extra: Headers = new Headers()) {
  const headers = new Headers(extra);
  headers.set("content-type", "application/problem+json");
  headers.set("cache-control", "no-store");
  headers.set("x-request-id", requestId);
  return new Response(
    JSON.stringify({
      type: `https://errors.getproperty.co/${code}`,
      title: detail,
      status,
      code,
      detail,
      requestId,
    }),
    { status, headers },
  );
}

/** Rejects encoded separators, dot segments and doubled slashes before anything is matched. */
function safePath(raw: string): string | null {
  if (/%2f|%5c|%2e|\\/i.test(raw)) return null;
  if (raw.includes("//")) return null;
  const segments = raw.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  return raw;
}

const RESIDENT = /^\/v1\/resident(\/|$)/;
const AUTH_RESIDENT = /^\/v1\/auth\/resident\//;
const TECHNICIAN = /^\/v1\/technician(\/|$)/;
const AUTH_TECHNICIAN = /^\/v1\/auth\/technician\//;

export function routeFor(pathname: string, technicianEnabled: boolean): Route | null {
  const path = safePath(pathname);
  if (!path) return null;
  if (path === "/auth/line") return { type: "exchange", path: "/v1/auth/resident/line", kind: "resident" };
  if (path === "/auth/technician/line") {
    return technicianEnabled ? { type: "exchange", path: "/v1/auth/technician/line", kind: "technician" } : null;
  }
  if (path === "/auth/logout") return { type: "logout" };
  if (path === "/auth/refresh") return { type: "refresh", kind: "resident" };
  if (path === "/auth/technician/refresh") return technicianEnabled ? { type: "refresh", kind: "technician" } : null;
  if (RESIDENT.test(path)) return { type: "proxy", path, kind: "resident", auth: true };
  if (AUTH_RESIDENT.test(path)) return { type: "proxy", path, kind: "resident", auth: false };
  if (technicianEnabled && TECHNICIAN.test(path)) return { type: "proxy", path, kind: "technician", auth: true };
  if (technicianEnabled && AUTH_TECHNICIAN.test(path)) return { type: "proxy", path, kind: "technician", auth: false };
  return null;
}

function expectedOrigin(request: Request, configured?: string): string {
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

/** Same-origin and the custom header: a cross-site form or `fetch` can do neither without CORS, which we never grant. */
export function csrfViolation(request: Request, configuredOrigin?: string): string | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  if (request.headers.get(CSRF_HEADER) !== "1") return "missing x-getproperty-csrf header";
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return `sec-fetch-site ${site}`;
  const origin = request.headers.get("origin");
  if (!origin) return site === "same-origin" ? null : "no Origin header";
  if (origin !== expectedOrigin(request, configuredOrigin)) return "cross-origin request";
  return null;
}

function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? undefined;
}

class BodyTooLarge extends Error {}

async function readBody(request: Request, limit: number): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new BodyTooLarge();
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

function upstreamHeaders(request: Request, requestId: string, extra: Record<string, string>): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept-language")) {
    const locale = parseCookieHeader(request.headers.get("cookie")).get("gp_locale");
    if (locale) headers.set("accept-language", locale);
  }
  headers.set("x-request-id", requestId);
  const ip = clientIp(request);
  if (ip) headers.set("x-forwarded-for", ip);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return headers;
}

function downstreamHeaders(upstream: Response, requestId: string, cookies: CookieToSet[]): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("x-request-id")) headers.set("x-request-id", requestId);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  if ((headers.get("content-type") ?? "").includes("text/event-stream")) headers.set("x-accel-buffering", "no");
  for (const cookie of cookies) headers.append("set-cookie", serializeCookie(cookie));
  return headers;
}

/** A 401 whose problem is about the session (`auth.unauthenticated`, or no readable code), not about a code typed. */
async function sessionProblem(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.clone().json();
    const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
    return typeof code !== "string" || code === "auth.unauthenticated";
  } catch {
    return true;
  }
}

function isTokenPair(value: unknown): value is TokenPairLike & { subject?: unknown } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as TokenPairLike).accessToken === "string" &&
    typeof (value as TokenPairLike).refreshToken === "string"
  );
}

/** What the browser learns about a new session: who, not the tokens. */
function sessionView(pair: TokenPairLike & { subject?: unknown }) {
  return { subject: pair.subject ?? null, accessTokenExpiresAt: pair.accessTokenExpiresAt };
}

export function createBffHandler(config: BffConfig | (() => BffConfig)) {
  const resolve = typeof config === "function" ? config : () => config;

  return async function handle(request: Request): Promise<Response> {
    const cfg = resolve();
    const now = cfg.now ?? Date.now;
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);
    const rawPath = url.pathname.replace(/^\/bff/, "") || "/";

    const route = routeFor(rawPath, cfg.technicianEnabled);
    if (!route) return problem(404, "bff.not_allowed", "This path is not available to the resident app", requestId);

    const csrf = csrfViolation(request, cfg.appOrigin);
    if (csrf) return problem(403, "bff.csrf", "Cross-site request refused", requestId);

    let body: ArrayBuffer | undefined;
    try {
      body = await readBody(request, cfg.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        return problem(413, "bff.payload_too_large", "Upload files with a presigned URL", requestId);
      }
      throw error;
    }

    const jar = parseCookieHeader(request.headers.get("cookie"));
    const extra = cfg.upstreamHeaders?.(request) ?? {};
    const headers = upstreamHeaders(request, requestId, extra);
    const call = async (path: string, init: { method: string; headers: Headers; body?: ArrayBuffer | string }) => {
      try {
        return await cfg.upstream(
          new Request(`${cfg.apiBaseUrl}${path}`, { method: init.method, headers: init.headers, body: init.body }),
        );
      } catch {
        return null;
      }
    };
    const unavailable = () => problem(502, "bff.upstream_unavailable", "The service is unavailable", requestId);

    // ── logout: end every sign-in this browser holds, whatever the API answers ──────────────────
    if (route.type === "logout") {
      const cookies: CookieToSet[] = [];
      for (const kind of ["resident", "technician"] as const) {
        const refreshToken = jar.get(SESSION_COOKIES[kind].refresh);
        if (refreshToken) {
          const logoutHeaders = new Headers(headers);
          logoutHeaders.set("content-type", "application/json");
          await call("/v1/auth/logout", {
            method: "POST",
            headers: logoutHeaders,
            body: JSON.stringify({ refreshToken }),
          });
        }
        cookies.push(...clearedCookies(kind));
      }
      return new Response(null, { status: 204, headers: downstreamHeaders(new Response(), requestId, cookies) });
    }

    // ── forced rotation: new scopes after linking an invitation (refreshRequired, D-061) ──────────
    if (route.type === "refresh") {
      if (request.method !== "POST") return problem(405, "http.method_not_allowed", "Use POST", requestId);
      const refreshToken = jar.get(SESSION_COOKIES[route.kind].refresh);
      if (!refreshToken) return problem(401, "auth.unauthenticated", "Sign in again", requestId);
      const outcome = await refreshTokens(
        cfg.apiBaseUrl,
        refreshToken,
        cfg.upstream,
        { "x-request-id": requestId, ...extra },
        now,
      );
      if (outcome.ok) {
        const out = downstreamHeaders(new Response(), requestId, sessionCookies(route.kind, outcome.pair, now()));
        out.set("content-type", "application/json");
        return new Response(JSON.stringify(sessionView(outcome.pair)), { status: 200, headers: out });
      }
      if (refreshRejected(outcome)) {
        const out = problem(401, "auth.unauthenticated", "Sign in again", requestId);
        for (const cookie of clearedCookies(route.kind)) out.headers.append("set-cookie", serializeCookie(cookie));
        return out;
      }
      return unavailable();
    }

    // ── id-token exchange: the response's tokens become cookies ───────────────────────────────
    if (route.type === "exchange" || (route.type === "proxy" && !route.auth)) {
      const response = await call(route.path + url.search, { method: request.method, headers, body });
      if (!response) return unavailable();
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) {
        return new Response(response.body, {
          status: response.status,
          headers: downstreamHeaders(response, requestId, []),
        });
      }
      const payload: unknown = await response.json();
      if (!isTokenPair(payload)) {
        return new Response(JSON.stringify(payload), {
          status: response.status,
          headers: downstreamHeaders(response, requestId, []),
        });
      }
      const out = downstreamHeaders(response, requestId, sessionCookies(route.kind, payload, now()));
      out.set("content-type", "application/json");
      return new Response(JSON.stringify(sessionView(payload)), { status: response.status, headers: out });
    }

    // ── authenticated passthrough: bearer, refresh before expiry, refresh once on 401 ───────────
    const names = SESSION_COOKIES[route.kind];
    let access = jar.get(names.access);
    let refresh = jar.get(names.refresh);
    const cookies: CookieToSet[] = [];
    let refreshed = false;

    const refreshOnce = async (): Promise<"ok" | "rejected" | "unavailable" | "none"> => {
      if (refreshed || !refresh) return "none";
      refreshed = true;
      const outcome = await refreshTokens(
        cfg.apiBaseUrl,
        refresh,
        cfg.upstream,
        { "x-request-id": requestId, ...extra },
        now,
      );
      if (outcome.ok) {
        cookies.push(...sessionCookies(route.kind, outcome.pair, now()));
        access = outcome.pair.accessToken;
        refresh = outcome.pair.refreshToken;
        return "ok";
      }
      if (refreshRejected(outcome)) {
        cookies.push(...clearedCookies(route.kind));
        access = undefined;
        refresh = undefined;
        return "rejected";
      }
      return "unavailable";
    };

    if (refresh && accessTokenStale(access, now())) await refreshOnce();

    const send = () => {
      const h = new Headers(headers);
      if (access) h.set("authorization", `Bearer ${access}`);
      return call(route.path + url.search, { method: request.method, headers: h, body });
    };

    let response = await send();
    // Only a 401 about the session itself means "refresh": an `auth.otp_invalid` / `auth.otp_expired` (the code a
    // resident typed to sign a lease, D-062) is the resident's answer, and retrying would spend another attempt.
    const sessionExpired = response?.status === 401 && (await sessionProblem(response));
    if (response && sessionExpired && !refreshed && refresh) {
      const outcome = await refreshOnce();
      if (outcome === "ok") {
        await response.body?.cancel();
        response = await send();
      }
    }
    if (!response) {
      const out = unavailable();
      for (const cookie of cookies) out.headers.append("set-cookie", serializeCookie(cookie));
      return out;
    }
    if (response.status === 401 && sessionExpired && access && !refresh) {
      // The API no longer accepts this access token and there is no refresh token left to renew it with.
      cookies.push(...clearedCookies(route.kind));
    }
    return new Response(response.body, {
      status: response.status,
      headers: downstreamHeaders(response, requestId, cookies),
    });
  };
}
