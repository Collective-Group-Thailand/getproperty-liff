// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetRefreshCacheForTesting } from "@/lib/auth/refresh";

import { createBffHandler, csrfViolation, routeFor, type BffConfig } from "./handler";

const API = "http://api.internal";
const APP = "https://app.example";
const NOW = Date.parse("2026-11-01T00:00:00+07:00");

function jwt(claims: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "EdDSA" })}.${b64(claims)}.sig`;
}
const freshAccess = jwt({ aud: "resident", exp: NOW / 1000 + 600, sid: "s1" });
const staleAccess = jwt({ aud: "resident", exp: NOW / 1000 + 10, sid: "s1" });

function pair(n: number) {
  return {
    accessToken: jwt({ aud: "resident", exp: NOW / 1000 + 900, sid: "s1", n }),
    accessTokenExpiresAt: "2026-11-01T00:15:00+07:00",
    refreshToken: `rt-${n}`,
    refreshTokenExpiresAt: "2026-12-01T00:00:00+07:00",
    subject: { audience: "resident", id: "u1", permissions: [], roles: [], scopes: ["unit:x"], type: "user" },
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ status, code, title: code, detail: code, requestId: "api-req" }), {
    status,
    headers: { "content-type": "application/problem+json", "x-request-id": "api-req" },
  });

type Script = (request: Request) => Response | Promise<Response>;

function setup(script: Script, overrides: Partial<BffConfig> = {}) {
  const calls: { method: string; path: string; auth: string | null; body: string; headers: Headers }[] = [];
  const upstream = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    calls.push({
      method: request.method,
      path: url.pathname + url.search,
      auth: request.headers.get("authorization"),
      body: request.method === "GET" ? "" : await request.clone().text(),
      headers: request.headers,
    });
    return script(request);
  });
  const handler = createBffHandler({
    apiBaseUrl: API,
    upstream,
    technicianEnabled: false,
    appOrigin: APP,
    now: () => NOW,
    ...overrides,
  });
  return { handler, calls, upstream };
}

function req(path: string, init: RequestInit & { cookies?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookies) {
    headers.set(
      "cookie",
      Object.entries(init.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    );
  }
  const method = init.method ?? "GET";
  if (method !== "GET" && !headers.has("origin")) headers.set("origin", APP);
  if (method !== "GET" && !headers.has("x-getproperty-csrf")) headers.set("x-getproperty-csrf", "1");
  return new Request(`${APP}/bff${path}`, { ...init, method, headers });
}

const setCookies = (response: Response) => response.headers.getSetCookie();

afterEach(() => resetRefreshCacheForTesting());

describe("allow-list", () => {
  it.each([
    "/v1/resident/me",
    "/v1/resident/invoices/0199f2a0/pay",
    "/v1/auth/resident/line",
    "/v1/auth/resident/otp/request",
  ])("lets %s through", (path) => {
    expect(routeFor(path, false)).not.toBeNull();
  });

  it.each([
    "/v1/owner/me",
    "/v1/staff/me",
    "/v1/admin/me",
    "/v1/device/bootstrap",
    "/v1/auth/operator/login",
    "/v1/auth/platform/login",
    "/v1/auth/refresh",
    "/v1/auth/logout",
    "/v1/residents/me",
    "/v1/resident/..%2fowner/me",
    "/v1/resident/%2e%2e/owner",
    "/v1/resident//me",
    "/v1/resident/a\\b",
    "/v1/technician/me",
    "/v1/auth/technician/line",
    "/auth/technician/line",
    // Routes are case-sensitive in the API since the release fixes (review #7): never forwarded in another case.
    "/V1/RESIDENT/me",
    "/v1/Resident/me",
    "/v1/auth/Resident/otp/verify",
    "/AUTH/REFRESH",
    "/",
  ])("refuses %s", (path) => {
    expect(routeFor(path, false)).toBeNull();
  });

  it("opens the technician prefixes only with FEATURE_TECHNICIAN (R2)", () => {
    expect(routeFor("/v1/technician/me", true)).toMatchObject({ type: "proxy", kind: "technician", auth: true });
    expect(routeFor("/v1/auth/technician/line", true)).toMatchObject({
      type: "proxy",
      kind: "technician",
      auth: false,
    });
    expect(routeFor("/auth/technician/line", true)).toMatchObject({ type: "exchange", kind: "technician" });
    expect(routeFor("/auth/technician/refresh", true)).toMatchObject({ type: "refresh", kind: "technician" });
    expect(routeFor("/v1/auth/technician/otp/verify", true)).toMatchObject({ type: "proxy", auth: false });
    expect(routeFor("/v1/owner/me", true)).toBeNull();
    for (const path of ["/auth/technician/refresh", "/v1/technician/work-orders", "/v1/auth/technician/otp/verify"]) {
      expect(routeFor(path, false), path).toBeNull();
    }
  });

  it("answers a refused path with a 404 problem and never calls the API", async () => {
    const { handler, upstream } = setup(() => json({}));
    for (const path of ["/v1/owner/me", "/v1/admin/me"]) {
      const response = await handler(req(path, { cookies: { "__Host-gp_at": freshAccess } }));
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect((await response.json()).code).toBe("bff.not_allowed");
    }
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("CSRF", () => {
  const post = (headers: Record<string, string>) =>
    new Request(`${APP}/bff/v1/resident/consents`, { method: "POST", headers, body: "{}" });

  it("requires the custom header and the same origin on every non-GET", () => {
    expect(csrfViolation(post({ origin: APP }), APP)).toMatch(/x-getproperty-csrf/);
    expect(csrfViolation(post({ origin: "https://evil.example", "x-getproperty-csrf": "1" }), APP)).toMatch(
      /cross-origin/,
    );
    expect(
      csrfViolation(post({ "sec-fetch-site": "cross-site", "x-getproperty-csrf": "1", origin: APP }), APP),
    ).toMatch(/sec-fetch-site/);
    expect(csrfViolation(post({ "x-getproperty-csrf": "1" }), APP)).toMatch(/no Origin/);
    expect(
      csrfViolation(post({ origin: APP, "x-getproperty-csrf": "1", "sec-fetch-site": "same-origin" }), APP),
    ).toBeNull();
    expect(csrfViolation(new Request(`${APP}/bff/v1/resident/me`), APP)).toBeNull();
  });

  it("derives the origin from the forwarded host when APP_ORIGIN is unset", () => {
    const request = new Request("http://10.0.0.5:8080/bff/v1/resident/consents", {
      method: "POST",
      headers: {
        origin: "https://liff.getproperty.co",
        "x-forwarded-host": "liff.getproperty.co",
        "x-forwarded-proto": "https",
        "x-getproperty-csrf": "1",
      },
    });
    expect(csrfViolation(request)).toBeNull();
  });

  it("refuses with 403 before reaching the API", async () => {
    const { handler, upstream } = setup(() => json({}));
    const response = await handler(
      new Request(`${APP}/bff/v1/resident/consents`, { method: "POST", headers: { origin: APP }, body: "{}" }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("bff.csrf");
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("LIFF id-token exchange", () => {
  it("turns the token pair into __Host- httpOnly cookies and never returns the tokens", async () => {
    const { handler, calls } = setup(() => json(pair(1)));
    const response = await handler(
      req("/auth/line", {
        method: "POST",
        body: JSON.stringify({ idToken: "fake-line.abc" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/v1/auth/resident/line", auth: null });
    expect(JSON.parse(calls[0]!.body)).toEqual({ idToken: "fake-line.abc" });

    const text = await response.text();
    expect(text).not.toContain(pair(1).accessToken);
    expect(text).not.toContain("rt-1");
    expect(JSON.parse(text)).toEqual({ subject: pair(1).subject, accessTokenExpiresAt: pair(1).accessTokenExpiresAt });

    const cookies = setCookies(response);
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__Host-gp_(at|rt)=/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
      expect(cookie).not.toMatch(/Domain=/i);
    }
    expect(cookies.find((c) => c.startsWith("__Host-gp_at="))).toContain("Max-Age=900");
    expect(cookies.find((c) => c.startsWith("__Host-gp_rt="))).toMatch(/Max-Age=\d{7}/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does the same for the SMS code and passes problems through untouched", async () => {
    const { handler } = setup((request) =>
      new URL(request.url).pathname.endsWith("/verify") ? json(pair(2)) : problem(401, "auth.otp_invalid"),
    );
    const ok = await handler(req("/v1/auth/resident/otp/verify", { method: "POST", body: "{}" }));
    expect(setCookies(ok).map((c) => c.split("=")[0])).toEqual(["__Host-gp_at", "__Host-gp_rt"]);
    const refused = await handler(req("/v1/auth/resident/otp/request", { method: "POST", body: "{}" }));
    expect(refused.status).toBe(401);
    expect((await refused.json()).code).toBe("auth.otp_invalid");
    expect(setCookies(refused)).toEqual([]);
  });

  it("stores technician sessions under their own cookie names", async () => {
    const { handler, calls } = setup(() => json(pair(3)), { technicianEnabled: true });
    const response = await handler(req("/auth/technician/line", { method: "POST", body: "{}" }));
    expect(calls[0]!.path).toBe("/v1/auth/technician/line");
    expect(setCookies(response).map((c) => c.split("=")[0])).toEqual(["__Host-gp_tat", "__Host-gp_trt"]);
  });
});

describe("authenticated passthrough", () => {
  it("sends the cookie's token as a bearer with the request id, language and client ip", async () => {
    const { handler, calls } = setup(() => json({ ok: true }, 200, { "x-request-id": "api-1", etag: '"v1"' }));
    const response = await handler(
      req("/v1/resident/me?x=1", {
        cookies: { "__Host-gp_at": freshAccess, "__Host-gp_rt": "rt-0", gp_locale: "en" },
        headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "Line/14.0" },
      }),
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe("/v1/resident/me?x=1");
    expect(calls[0]!.auth).toBe(`Bearer ${freshAccess}`);
    expect(calls[0]!.headers.get("accept-language")).toBe("en");
    expect(calls[0]!.headers.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(calls[0]!.headers.get("user-agent")).toBe("Line/14.0");
    expect(calls[0]!.headers.get("cookie")).toBeNull();
    expect(response.headers.get("x-request-id")).toBe("api-1");
    expect(response.headers.get("etag")).toBe('"v1"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(setCookies(response)).toEqual([]);
  });

  it("refreshes once on a 401, retries, and writes the rotated cookies", async () => {
    let meCalls = 0;
    const { handler, calls } = setup((request) => {
      const path = new URL(request.url).pathname;
      if (path === "/v1/auth/refresh") return json(pair(5));
      meCalls += 1;
      return meCalls === 1 ? problem(401, "auth.unauthenticated") : json({ me: true });
    });
    const response = await handler(
      req("/v1/resident/me", { cookies: { "__Host-gp_at": freshAccess, "__Host-gp_rt": "rt-4" } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ me: true });
    expect(calls.map((c) => c.path)).toEqual(["/v1/resident/me", "/v1/auth/refresh", "/v1/resident/me"]);
    expect(JSON.parse(calls[1]!.body)).toEqual({ refreshToken: "rt-4" });
    expect(calls[2]!.auth).toBe(`Bearer ${pair(5).accessToken}`);
    const cookies = setCookies(response);
    expect(cookies.find((c) => c.startsWith("__Host-gp_rt="))).toContain("rt-5");
  });

  it("never refreshes on a 401 about a typed code (signature OTP): the attempt is not spent twice", async () => {
    const { handler, calls } = setup(() => problem(401, "auth.otp_invalid"));
    const response = await handler(
      req("/v1/resident/leases/l1/sign", {
        method: "POST",
        body: "{}",
        cookies: { "__Host-gp_at": freshAccess, "__Host-gp_rt": "rt-1" },
      }),
    );
    expect(response.status).toBe(401);
    expect(calls.map((c) => c.path)).toEqual(["/v1/resident/leases/l1/sign"]);
    expect(setCookies(response)).toEqual([]);
  });

  it("never refreshes twice in one request", async () => {
    const { handler, calls } = setup((request) =>
      new URL(request.url).pathname === "/v1/auth/refresh" ? json(pair(6)) : problem(401, "auth.unauthenticated"),
    );
    const response = await handler(
      req("/v1/resident/me", { cookies: { "__Host-gp_at": freshAccess, "__Host-gp_rt": "rt-5" } }),
    );
    expect(response.status).toBe(401);
    expect(calls.filter((c) => c.path === "/v1/auth/refresh")).toHaveLength(1);
    expect(calls.filter((c) => c.path === "/v1/resident/me")).toHaveLength(2);
    // The rotated pair is still written: the old refresh token is spent.
    expect(setCookies(response).find((c) => c.startsWith("__Host-gp_rt="))).toContain("rt-6");
  });

  it("renews a token that is about to expire before calling the API", async () => {
    const { handler, calls } = setup((request) =>
      new URL(request.url).pathname === "/v1/auth/refresh" ? json(pair(7)) : json({ ok: true }),
    );
    await handler(req("/v1/resident/me", { cookies: { "__Host-gp_at": staleAccess, "__Host-gp_rt": "rt-6" } }));
    expect(calls.map((c) => c.path)).toEqual(["/v1/auth/refresh", "/v1/resident/me"]);
    expect(calls[1]!.auth).toBe(`Bearer ${pair(7).accessToken}`);
  });

  it("ends the session when the API rejects the refresh token", async () => {
    const { handler } = setup((request) =>
      new URL(request.url).pathname === "/v1/auth/refresh"
        ? problem(401, "auth.refresh_reused")
        : problem(401, "auth.unauthenticated"),
    );
    const response = await handler(req("/v1/resident/me", { cookies: { "__Host-gp_rt": "rt-old" } }));
    expect(response.status).toBe(401);
    const cookies = setCookies(response);
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) expect(cookie).toContain("Max-Age=0");
  });

  it("keeps the session when the refresh endpoint is merely unavailable", async () => {
    const { handler } = setup((request) =>
      new URL(request.url).pathname === "/v1/auth/refresh" ? problem(503, "service.unavailable") : json({ ok: true }),
    );
    const response = await handler(
      req("/v1/resident/me", { cookies: { "__Host-gp_at": staleAccess, "__Host-gp_rt": "rt-7" } }),
    );
    expect(response.status).toBe(200);
    expect(setCookies(response)).toEqual([]);
  });

  it("shares one refresh between concurrent requests holding the same refresh token (D-163 reuse)", async () => {
    let refreshes = 0;
    const { handler } = setup(async (request) => {
      if (new URL(request.url).pathname === "/v1/auth/refresh") {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json(pair(8));
      }
      return json({ ok: true });
    });
    const cookies = { "__Host-gp_at": staleAccess, "__Host-gp_rt": "rt-shared" };
    const responses = await Promise.all([1, 2, 3].map(() => handler(req("/v1/resident/me", { cookies }))));
    expect(refreshes).toBe(1);
    for (const response of responses) expect(response.status).toBe(200);
  });

  it("does not refresh on 403 (wrong audience is not an expired session)", async () => {
    const { handler, calls } = setup(() => problem(403, "auth.wrong_audience"));
    const response = await handler(
      req("/v1/resident/me", { cookies: { "__Host-gp_at": freshAccess, "__Host-gp_rt": "rt-8" } }),
    );
    expect(response.status).toBe(403);
    expect(calls.map((c) => c.path)).toEqual(["/v1/resident/me"]);
  });

  it("caps request bodies (photos and slips go by presigned URL)", async () => {
    const { handler, upstream } = setup(() => json({}), { maxBodyBytes: 1024 });
    const response = await handler(
      req("/v1/resident/consents", {
        method: "POST",
        body: "x".repeat(2048),
        cookies: { "__Host-gp_at": freshAccess },
      }),
    );
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("bff.payload_too_large");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("streams the body through untouched (SSE, PDF) and never caches", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));
        controller.enqueue(encoder.encode("event: payment.confirmed\ndata: {}\n\n"));
        controller.close();
      },
    });
    const { handler } = setup(() => new Response(stream, { headers: { "content-type": "text/event-stream" } }));
    const response = await handler(
      req("/v1/resident/realtime/stream?token=t", { cookies: { "__Host-gp_at": freshAccess } }),
    );
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await response.text()).toBe("event: ready\ndata: {}\n\nevent: payment.confirmed\ndata: {}\n\n");
  });

  it("passes the Idempotency-Key the browser chose", async () => {
    const { handler, calls } = setup(() => json([], 201));
    await handler(
      req("/v1/resident/data-subject-requests", {
        method: "POST",
        body: "{}",
        headers: { "idempotency-key": "3b241101-e2bb-4255-8caf-4136c566a962" },
        cookies: { "__Host-gp_at": freshAccess },
      }),
    );
    expect(calls[0]!.headers.get("idempotency-key")).toBe("3b241101-e2bb-4255-8caf-4136c566a962");
  });

  it("answers 502 as a problem when the API cannot be reached", async () => {
    const { handler } = setup(() => {
      throw new TypeError("fetch failed");
    });
    const response = await handler(req("/v1/resident/me", { cookies: { "__Host-gp_at": freshAccess } }));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("bff.upstream_unavailable");
  });
});

describe("logout", () => {
  it("ends every sign-in of this browser at the API and clears all session cookies", async () => {
    const { handler, calls } = setup(() => new Response(null, { status: 204 }), { technicianEnabled: true });
    const response = await handler(
      req("/auth/logout", { method: "POST", cookies: { "__Host-gp_rt": "rt-r", "__Host-gp_trt": "rt-t" } }),
    );
    expect(response.status).toBe(204);
    expect(calls.map((c) => [c.path, JSON.parse(c.body)])).toEqual([
      ["/v1/auth/logout", { refreshToken: "rt-r" }],
      ["/v1/auth/logout", { refreshToken: "rt-t" }],
    ]);
    const cookies = setCookies(response);
    expect(cookies.map((c) => c.split("=")[0]).sort()).toEqual([
      "__Host-gp_at",
      "__Host-gp_rt",
      "__Host-gp_tat",
      "__Host-gp_trt",
    ]);
    for (const cookie of cookies) expect(cookie).toContain("Max-Age=0");
  });
});

describe("forced refresh (refreshRequired after linking, D-061)", () => {
  it("rotates the resident session now and writes the new cookies without returning the tokens", async () => {
    const { handler, calls } = setup(() => json(pair(9)));
    const response = await handler(
      req("/auth/refresh", { method: "POST", cookies: { "__Host-gp_at": freshAccess, "__Host-gp_rt": "rt-8" } }),
    );
    expect(response.status).toBe(200);
    expect(calls.map((c) => [c.path, JSON.parse(c.body)])).toEqual([["/v1/auth/refresh", { refreshToken: "rt-8" }]]);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(pair(9).refreshToken);
    expect(body.subject.scopes).toEqual(["unit:x"]);
    expect(setCookies(response).find((c) => c.startsWith("__Host-gp_rt="))).toContain("rt-9");
  });

  it("needs POST with the CSRF header, a refresh cookie, and ends the session when the API refuses", async () => {
    const { handler } = setup(() => problem(401, "auth.refresh_invalid"));
    expect((await handler(req("/auth/refresh", { cookies: { "__Host-gp_rt": "rt" } }))).status).toBe(405);
    const csrf = await handler(
      req("/auth/refresh", {
        method: "POST",
        headers: { "x-getproperty-csrf": "0" },
        cookies: { "__Host-gp_rt": "rt" },
      }),
    );
    expect(csrf.status).toBe(403);
    expect((await handler(req("/auth/refresh", { method: "POST" }))).status).toBe(401);
    const refused = await handler(req("/auth/refresh", { method: "POST", cookies: { "__Host-gp_rt": "rt-x" } }));
    expect(refused.status).toBe(401);
    for (const cookie of setCookies(refused)) expect(cookie).toContain("Max-Age=0");
  });
});
