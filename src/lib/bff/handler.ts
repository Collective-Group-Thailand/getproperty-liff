import {
  accessTokenStale,
  clearedCookies,
  parseCookieHeader,
  serializeCookie,
  LANDLORD_TENANT_COOKIE,
  SESSION_COOKIES,
  sessionCookies,
  type CookieToSet,
  type SessionKind,
  type TokenPairLike,
} from "@/lib/auth/cookies";
import { refreshRejected, refreshTokens } from "@/lib/auth/refresh";
import { clientIpFrom, requestIdFrom } from "@/lib/http/edge";

/**
 * The resident BFF (master plan §4, ADR-0006): the browser's only way to the API.
 *
 *   /bff/v1/<allow-listed path>     passthrough with the session's bearer
 *   /bff/auth/line                  LIFF id token → `/v1/auth/resident/line` → cookies
 *   /bff/auth/technician/line       same for technicians (FEATURE_TECHNICIAN=1)
 *   /bff/auth/logout                `/v1/auth/logout` for every session of this browser, cookies cleared (POST +
 *                                   CSRF only: a cross-site link must not sign residents out — review L1)
 *   /bff/auth/refresh               rotate the resident session now (POST) — after `/v1/resident/link` answers
 *                                   `refreshRequired`, so the new `lease:`/`unit:` scopes arrive (D-061)
 *   /bff/auth/technician/refresh    rotate the technician session now (POST) — a work order assigned after sign-in
 *                                   arrives with the next token's `work_order:` scopes (D-210)
 *   /bff/auth/prospect/line         LIFF id token → `/v1/auth/prospect/line` → the prospect's cookies (L5, D-281)
 *   /bff/auth/landlord/line         LIFF id token → `/v1/auth/operator/identity` (provider `line`) → the landlord's
 *                                   operator cookies + the tenant of the session (L5 5.3, D-251, D-255)
 *
 * Rules: allow-list (`/v1/resident`, `/v1/auth/resident`; `/v1/technician`, `/v1/auth/technician` with the
 * technician flag; `/v1/prospect`, `/v1/auth/prospect` and the public listing reads `/v1/public/listings` for prospects,
 * L5; the landlord's quick actions `LANDLORD_ROUTES` with the landlord session and its `X-Tenant-Id`, L5 5.3) — the
 * rest of `/v1/owner`, `/v1/staff`, `/v1/admin`, `/v1/device` and everything else 404; bearer from the
 * httpOnly cookie, refreshed before it expires and **once** on a 401, rotated cookies always written back; tokens
 * in auth responses become cookies and never reach the browser; same-origin + `x-getproperty-csrf: 1` on every
 * non-GET; request bodies capped per route, matching the API's own limits (`BODY_LIMITS`: inline slip images and
 * signature PNGs are larger than everything else; photos go to object storage by presigned URL — review H1);
 * responses streamed (PDF, SSE) and never cached. The client address sent to the API is the one our edge appended
 * (`trustedHops` from the right of `X-Forwarded-For`, review H2); a request id is accepted only as a UUID (L4). The
 * realtime stream token travels in an httpOnly cookie between the browser and this BFF, never in a browser URL
 * (review L5; the API itself still takes it in the query string — EventSource cannot send headers).
 */
export interface BffConfig {
  apiBaseUrl: string;
  upstream: (request: Request) => Promise<Response>;
  technicianEnabled: boolean;
  /** Public origin of this app; derived from the request when unset. */
  appOrigin?: string;
  /** Default body cap for routes without their own (`BODY_LIMITS`). */
  maxBodyBytes?: number;
  /** Proxies in front of this app that append to `X-Forwarded-For` (Caddy on the platform: 1); 0 = forward none. */
  trustedHops?: number;
  now?: () => number;
  /** Extra headers for every upstream call (the mock scenario in mock builds). */
  upstreamHeaders?: (request: Request) => Record<string, string>;
}

export const CSRF_HEADER = "x-getproperty-csrf";
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

const MIB = 1024 * 1024;
/**
 * Routes whose JSON bodies are larger than the default, with the API's limit for the same route (getproperty-api
 * `src/common/http/json-body-parser.ts`, review H1): a transfer slip is sent inline (base64 of an image ≤ 5 MB,
 * `POST …/slips`, API 7 MiB) and a lease signature carries its PNG (`POST …/sign`, the API's default 1 MiB).
 */
export const BODY_LIMITS: readonly { method: string; pattern: RegExp; bytes: number }[] = [
  { method: "POST", pattern: /^\/v1\/resident\/invoices\/[^/]+\/slips$/, bytes: 7 * MIB },
  { method: "POST", pattern: /^\/v1\/resident\/leases\/[^/]+\/sign$/, bytes: 1 * MIB },
  { method: "POST", pattern: /^\/v1\/resident\/inspections\/[^/]+\/actions\/countersign$/, bytes: 1 * MIB },
];

export function bodyLimitFor(method: string, path: string, fallback: number = DEFAULT_MAX_BODY_BYTES): number {
  return BODY_LIMITS.find((limit) => limit.method === method && limit.pattern.test(path))?.bytes ?? fallback;
}

/** httpOnly cookie that carries the 60-second realtime stream token from `realtime/auth` to `realtime/stream`. */
export const STREAM_TOKEN_COOKIES: Record<SessionKind, string> = {
  resident: "__Host-gp_sst",
  technician: "__Host-gp_tsst",
  prospect: "__Host-gp_psst",
  landlord: "__Host-gp_lsst",
};
const REALTIME_AUTH = /^\/v1\/(resident|technician)\/realtime\/auth$/;

/**
 * The realtime stream with its `event:` field lines removed: every event reaches the browser as a default `message`
 * whose JSON data carries its `type` (contract §6), so the client needs one listener instead of a list of every event
 * name (and hears new types without a release — D-179 budget). Line-based and streaming: a line split across chunks is
 * held until it is complete.
 */
export function asDefaultEvents(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let rest = "";
  const keep = (line: string) => !/^event:/.test(line);
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        rest += decoder.decode(chunk, { stream: true });
        const lines = rest.split("\n");
        rest = lines.pop() ?? "";
        const out = lines
          .filter(keep)
          .map((line) => `${line}\n`)
          .join("");
        if (out) controller.enqueue(encoder.encode(out));
      },
      flush(controller) {
        rest += decoder.decode();
        if (rest && keep(rest)) controller.enqueue(encoder.encode(rest));
      },
    }),
  );
}
const REALTIME_STREAM = /^\/v1\/(resident|technician)\/realtime\/stream$/;

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
const PROSPECT = /^\/v1\/prospect(\/|$)/;
const AUTH_PROSPECT = /^\/v1\/auth\/prospect\//;
/**
 * The landlord's quick actions in LINE (L5 5.3, D-251): exactly these operator calls, nothing else of `/v1/owner` —
 * the rest of the console stays in getproperty-web.
 */
export const LANDLORD_ROUTES: readonly { method: string; pattern: RegExp }[] = [
  { method: "GET", pattern: /^\/v1\/owner\/me$/ },
  { method: "GET", pattern: /^\/v1\/owner\/leads$/ },
  { method: "GET", pattern: /^\/v1\/owner\/leads\/[0-9a-f-]{36}$/ },
  { method: "POST", pattern: /^\/v1\/owner\/leads\/[0-9a-f-]{36}\/messages$/ },
  { method: "GET", pattern: /^\/v1\/owner\/listing-viewings$/ },
  { method: "POST", pattern: /^\/v1\/owner\/listing-viewings\/[0-9a-f-]{36}\/actions\/(confirm|decline)$/ },
  { method: "GET", pattern: /^\/v1\/owner\/payments$/ },
  { method: "GET", pattern: /^\/v1\/owner\/invoices$/ },
  { method: "POST", pattern: /^\/v1\/owner\/invoices\/[0-9a-f-]{36}\/actions\/send-reminder$/ },
  { method: "GET", pattern: /^\/v1\/owner\/leases$/ },
];

export function landlordRouteAllowed(method: string, path: string): boolean {
  return LANDLORD_ROUTES.some((route) => route.method === method && route.pattern.test(path));
}

/** Anonymous reads of a published listing and its free viewing times (no session, no personal data). */
const PUBLIC_LISTINGS = /^\/v1\/public\/listings\/[a-z0-9-]+(\/viewing-slots)?$/;

export function routeFor(pathname: string, technicianEnabled: boolean, method = "GET"): Route | null {
  const path = safePath(pathname);
  if (!path) return null;
  if (path === "/auth/line") return { type: "exchange", path: "/v1/auth/resident/line", kind: "resident" };
  if (path === "/auth/technician/line") {
    return technicianEnabled ? { type: "exchange", path: "/v1/auth/technician/line", kind: "technician" } : null;
  }
  if (path === "/auth/prospect/line") return { type: "exchange", path: "/v1/auth/prospect/line", kind: "prospect" };
  if (path === "/auth/landlord/line") return { type: "exchange", path: "/v1/auth/operator/identity", kind: "landlord" };
  if (path === "/auth/landlord/refresh") return { type: "refresh", kind: "landlord" };
  if (/^\/v1\/owner\//.test(path)) {
    return landlordRouteAllowed(method, path) ? { type: "proxy", path, kind: "landlord", auth: true } : null;
  }
  if (path === "/auth/logout") return { type: "logout" };
  if (path === "/auth/refresh") return { type: "refresh", kind: "resident" };
  if (path === "/auth/technician/refresh") return technicianEnabled ? { type: "refresh", kind: "technician" } : null;
  if (path === "/auth/prospect/refresh") return { type: "refresh", kind: "prospect" };
  if (PROSPECT.test(path)) return { type: "proxy", path, kind: "prospect", auth: true };
  if (AUTH_PROSPECT.test(path)) return { type: "proxy", path, kind: "prospect", auth: false };
  if (PUBLIC_LISTINGS.test(path)) return { type: "proxy", path, kind: "prospect", auth: false };
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

function upstreamHeaders(
  request: Request,
  requestId: string,
  clientIp: string | undefined,
  extra: Record<string, string>,
): Headers {
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
  // One address, the one our edge saw — never the inbound header as is (its left-most entries are the client's).
  if (clientIp) headers.set("x-forwarded-for", clientIp);
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

/** `{ idToken }` from the app → `{ provider: "line", idToken }` for `/v1/auth/operator/identity`. */
export function landlordExchangeBody(body: ArrayBuffer | undefined): string | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    const idToken = parsed && typeof parsed === "object" ? (parsed as { idToken?: unknown }).idToken : undefined;
    return typeof idToken === "string" && idToken ? JSON.stringify({ provider: "line", idToken }) : null;
  } catch {
    return null;
  }
}

/** The first `tenant:<uuid>` scope of an operator subject (a landlord has one organisation). */
export function tenantOf(subject: unknown): string | null {
  const scopes = subject && typeof subject === "object" ? (subject as { scopes?: unknown }).scopes : undefined;
  if (!Array.isArray(scopes)) return null;
  for (const scope of scopes) {
    const match = typeof scope === "string" ? /^tenant:([0-9a-f-]{36})$/.exec(scope) : null;
    if (match) return match[1]!;
  }
  return null;
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
    const requestId = requestIdFrom(request.headers);
    const clientIp = clientIpFrom(request.headers, cfg.trustedHops ?? 0);
    const url = new URL(request.url);
    const rawPath = url.pathname.replace(/^\/bff/, "") || "/";

    const route = routeFor(rawPath, cfg.technicianEnabled, request.method);
    if (!route) return problem(404, "bff.not_allowed", "This path is not available to the resident app", requestId);

    // Logout ends sessions: a state change, so POST with the CSRF checks below — never a GET a link can trigger.
    if (route.type === "logout" && request.method !== "POST") {
      return problem(405, "http.method_not_allowed", "Use POST", requestId, new Headers({ allow: "POST" }));
    }

    const csrf = csrfViolation(request, cfg.appOrigin);
    if (csrf) return problem(403, "bff.csrf", "Cross-site request refused", requestId);

    let body: ArrayBuffer | undefined;
    try {
      const limitPath = route.type === "proxy" ? route.path : rawPath;
      body = await readBody(
        request,
        bodyLimitFor(request.method, limitPath, cfg.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES),
      );
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        return problem(413, "bff.payload_too_large", "Upload files with a presigned URL", requestId);
      }
      throw error;
    }

    const jar = parseCookieHeader(request.headers.get("cookie"));
    const extra = cfg.upstreamHeaders?.(request) ?? {};
    const headers = upstreamHeaders(request, requestId, clientIp, extra);
    // The refresh calls carry the same request id, client address and mock scenario as the request they serve.
    const refreshHeaders: Record<string, string> = {
      "x-request-id": requestId,
      ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
      ...extra,
    };
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
      for (const kind of ["resident", "technician", "prospect", "landlord"] as const) {
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
        cookies.push(...clearedCookies(kind), { name: STREAM_TOKEN_COOKIES[kind], value: "", maxAge: 0 });
      }
      cookies.push({ name: LANDLORD_TENANT_COOKIE, value: "", maxAge: 0 });
      return new Response(null, { status: 204, headers: downstreamHeaders(new Response(), requestId, cookies) });
    }

    // ── forced rotation: new scopes after linking an invitation (refreshRequired, D-061) ──────────
    if (route.type === "refresh") {
      if (request.method !== "POST") return problem(405, "http.method_not_allowed", "Use POST", requestId);
      const refreshToken = jar.get(SESSION_COOKIES[route.kind].refresh);
      if (!refreshToken) return problem(401, "auth.unauthenticated", "Sign in again", requestId);
      const outcome = await refreshTokens(cfg.apiBaseUrl, refreshToken, cfg.upstream, refreshHeaders, now);
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
      let sent: ArrayBuffer | string | undefined = body;
      if (route.type === "exchange" && route.kind === "landlord") {
        // The app sends `{ idToken }` for every audience; the operator exchange names the provider (D-255).
        const parsed = landlordExchangeBody(body);
        if (!parsed) return problem(422, "validation.failed", "idToken is required", requestId);
        sent = parsed;
        headers.set("content-type", "application/json");
      }
      const response = await call(route.path + url.search, { method: request.method, headers, body: sent });
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
      const issued = sessionCookies(route.kind, payload, now());
      if (route.kind === "landlord") {
        const tenantId = tenantOf(payload.subject);
        if (!tenantId) return problem(403, "auth.forbidden", "No organisation on this sign-in", requestId);
        issued.push({ name: LANDLORD_TENANT_COOKIE, value: tenantId, maxAge: 400 * 24 * 3600 });
      }
      const out = downstreamHeaders(response, requestId, issued);
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
      const outcome = await refreshTokens(cfg.apiBaseUrl, refresh, cfg.upstream, refreshHeaders, now);
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

    // Realtime (review L5): the stream token rides in an httpOnly cookie between the browser and this BFF and is put
    // back into the API's query string here, so it never appears in a browser-visible URL or this app's access log.
    let search = url.search;
    if (request.method === "GET" && REALTIME_STREAM.test(route.path) && !url.searchParams.has("token")) {
      const token = jar.get(STREAM_TOKEN_COOKIES[route.kind]);
      if (token) {
        const params = new URLSearchParams(url.searchParams);
        params.set("token", token);
        search = `?${params.toString()}`;
      }
    }

    const tenantId = route.kind === "landlord" ? jar.get(LANDLORD_TENANT_COOKIE) : undefined;
    const send = () => {
      const h = new Headers(headers);
      if (access) h.set("authorization", `Bearer ${access}`);
      if (tenantId) h.set("x-tenant-id", tenantId);
      return call(route.path + search, { method: request.method, headers: h, body });
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
    if (
      request.method === "POST" &&
      REALTIME_AUTH.test(route.path) &&
      response.ok &&
      (response.headers.get("content-type") ?? "").includes("json")
    ) {
      const grant = (await response.json()) as Record<string, unknown>;
      const token = typeof grant.streamToken === "string" ? grant.streamToken : "";
      const expires = typeof grant.expiresAt === "string" ? Date.parse(grant.expiresAt) : Number.NaN;
      const maxAge = Number.isFinite(expires) ? Math.max(1, Math.min(120, Math.ceil((expires - now()) / 1000))) : 60;
      if (token) cookies.push({ name: STREAM_TOKEN_COOKIES[route.kind], value: token, maxAge });
      const streamUrl = new URL(String(grant.streamUrl ?? ""), "http://api.invalid");
      streamUrl.searchParams.delete("token");
      const out = downstreamHeaders(response, requestId, cookies);
      out.set("content-type", "application/json");
      return new Response(
        JSON.stringify({ ...grant, streamToken: "", streamUrl: `${streamUrl.pathname}${streamUrl.search}` }),
        { status: response.status, headers: out },
      );
    }
    const sse =
      REALTIME_STREAM.test(route.path) && (response.headers.get("content-type") ?? "").includes("text/event-stream");
    return new Response(sse && response.body ? asDefaultEvents(response.body) : response.body, {
      status: response.status,
      headers: downstreamHeaders(response, requestId, cookies),
    });
  };
}
