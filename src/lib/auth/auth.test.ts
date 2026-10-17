// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  accessTokenStale,
  clearedCookies,
  parseCookieHeader,
  readAccessClaims,
  rewriteCookieHeader,
  serializeCookie,
  sessionCookies,
} from "./cookies";
import { DEFAULT_ENTITLEMENTS, entitlementsOf } from "./entitlements";
import { consentPath, isLineInAppBrowser, signInPath } from "./redirects";
import { refreshTokens, resetRefreshCacheForTesting } from "./refresh";
import { renewBeforeRender, sessionKindForPath } from "./renew";

const NOW = Date.parse("2026-11-01T00:00:00+07:00");
const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const pair = {
  accessToken: jwt({ exp: NOW / 1000 + 900, aud: "resident" }),
  accessTokenExpiresAt: "2026-11-01T00:15:00+07:00",
  refreshToken: "rt-new",
  refreshTokenExpiresAt: "2026-12-01T00:00:00+07:00",
};

afterEach(() => resetRefreshCacheForTesting());

describe("session cookies", () => {
  it("live exactly as long as their tokens, with every flag", () => {
    const [access, refresh] = sessionCookies("resident", pair, NOW);
    expect(access).toEqual({ name: "__Host-gp_at", value: pair.accessToken, maxAge: 900 });
    expect(refresh).toMatchObject({ name: "__Host-gp_rt", value: "rt-new", maxAge: 30 * 86400 });
    expect(serializeCookie(access!)).toBe(
      `__Host-gp_at=${pair.accessToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`,
    );
    expect(serializeCookie(clearedCookies("technician")[0]!)).toMatch(
      /^__Host-gp_tat=; .*Max-Age=0; Expires=Thu, 01 Jan 1970/,
    );
  });

  it("parses and rewrites the Cookie header for the render after a refresh", () => {
    expect(parseCookieHeader("a=1; b=%7Bx%7D; broken").get("b")).toBe("{x}");
    const rewritten = rewriteCookieHeader("gp_locale=th; __Host-gp_at=old; __Host-gp_rt=r1", [
      { name: "__Host-gp_at", value: "new", maxAge: 900 },
      { name: "__Host-gp_rt", value: "", maxAge: 0 },
    ]);
    expect(parseCookieHeader(rewritten)).toEqual(
      new Map([
        ["gp_locale", "th"],
        ["__Host-gp_at", "new"],
      ]),
    );
  });

  it("reads (never verifies) the access token's expiry to decide when to refresh", () => {
    expect(readAccessClaims(pair.accessToken)).toMatchObject({ aud: "resident" });
    expect(readAccessClaims("garbage")).toBeNull();
    expect(accessTokenStale(pair.accessToken, NOW)).toBe(false);
    expect(accessTokenStale(pair.accessToken, NOW + 880_000)).toBe(true);
    expect(accessTokenStale(undefined, NOW)).toBe(true);
  });
});

describe("renewBeforeRender (proxy)", () => {
  const upstream = vi.fn(
    async () => new Response(JSON.stringify(pair), { headers: { "content-type": "application/json" } }),
  );

  it("does nothing while the access token is fresh or there is no refresh token", async () => {
    const fresh = jwt({ exp: NOW / 1000 + 600 });
    expect(
      await renewBeforeRender({
        cookieHeader: `__Host-gp_at=${fresh}; __Host-gp_rt=r`,
        kind: "resident",
        apiBaseUrl: "http://api",
        upstream,
        now: NOW,
      }),
    ).toEqual([]);
    expect(
      await renewBeforeRender({ cookieHeader: "", kind: "resident", apiBaseUrl: "http://api", upstream, now: NOW }),
    ).toEqual([]);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rotates a missing or expiring access token and clears a rejected session", async () => {
    const renewed = await renewBeforeRender({
      cookieHeader: "__Host-gp_rt=r1",
      kind: "resident",
      apiBaseUrl: "http://api",
      upstream,
      now: NOW,
    });
    expect(renewed.map((c) => c.name)).toEqual(["__Host-gp_at", "__Host-gp_rt"]);
    const rejected = await renewBeforeRender({
      cookieHeader: "__Host-gp_rt=r2",
      kind: "resident",
      apiBaseUrl: "http://api",
      upstream: async () => new Response(JSON.stringify({ code: "auth.refresh_invalid" }), { status: 401 }),
      now: NOW,
    });
    expect(rejected.every((c) => c.maxAge === 0)).toBe(true);
  });

  it("picks the technician session for /technician", () => {
    expect(sessionKindForPath("/technician")).toBe("technician");
    expect(sessionKindForPath("/technicians")).toBe("resident");
    expect(sessionKindForPath("/")).toBe("resident");
  });
});

describe("refreshTokens", () => {
  it("forgets a transient failure so the next request can retry with the same token", async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      return calls === 1 ? new Response("{}", { status: 503 }) : new Response(JSON.stringify(pair));
    };
    expect((await refreshTokens("http://api", "rt", flaky)).ok).toBe(false);
    expect((await refreshTokens("http://api", "rt", flaky)).ok).toBe(true);
    expect(calls).toBe(2);
  });
});

describe("entitlements (CONTRACT-REQUEST #2)", () => {
  it("defaults to bills only and shows nothing without a unit", () => {
    expect([...entitlementsOf({ units: [{} as never] })]).toEqual([...DEFAULT_ENTITLEMENTS]);
    expect([...entitlementsOf({ units: [] })]).toEqual([]);
    expect([...entitlementsOf({ units: [{} as never], entitlements: ["usage", "bills", "admin"] })]).toEqual([
      "usage",
      "bills",
    ]);
  });
});

describe("redirects", () => {
  it("sends LINE's in-app browser to the LIFF endpoint and others to the sign-in page", () => {
    const line = "Mozilla/5.0 (Linux; Android 14) Line/14.19.1";
    expect(isLineInAppBrowser(line)).toBe(true);
    expect(signInPath("/bills", line)).toBe("/liff?liff.state=%2Fbills");
    expect(signInPath("/bills", "Mozilla/5.0 Chrome")).toBe("/auth?next=%2Fbills");
    expect(signInPath("https://evil.example", null)).toBe("/auth");
    expect(consentPath("/link?code=OK")).toBe("/consent?next=%2Flink%3Fcode%3DOK");
    expect(consentPath("/")).toBe("/consent");
  });
});
