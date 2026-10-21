import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, createNonce, originOf, securityHeaders } from "./headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy({ nonce: "abc123==" });

  it("runs scripts by nonce only — no 'unsafe-inline' for scripts (L1)", () => {
    const scripts = directive(csp, "script-src");
    expect(scripts).toContain("'nonce-abc123=='");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows the LIFF SDK and LINE's APIs, and nothing else third-party", () => {
    expect(directive(csp, "script-src")).toContain("https://static.line-scdn.net");
    expect(directive(csp, "connect-src")).toContain("https://api.line.me");
    expect(directive(csp, "connect-src")).toContain("https://liffsdk.line-scdn.net");
    expect(directive(csp, "form-action")).toContain("https://access.line.me");
    expect(csp).not.toMatch(/googleapis|gstatic|\*\s|https:\s/);
  });

  it("adds the object-storage host for signed images and uploads, and Sentry's ingest", () => {
    const withHosts = contentSecurityPolicy({
      extraImg: ["https://collective-prod-getproperty-assets.s3.ap-southeast-7.amazonaws.com"],
      extraConnect: [
        "https://collective-prod-getproperty-assets.s3.ap-southeast-7.amazonaws.com",
        "https://o1.ingest.sentry.io",
      ],
    });
    expect(directive(withHosts, "img-src")).toContain(
      "https://collective-prod-getproperty-assets.s3.ap-southeast-7.amazonaws.com",
    );
    expect(directive(withHosts, "connect-src")).toContain("https://o1.ingest.sentry.io");
  });

  it("refuses plugins, foreign frames and base-tag injection", () => {
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-src")).toBe("frame-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "frame-ancestors")).toContain("https://liff.line.me");
  });

  it("only allows eval and websockets in development", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    const dev = contentSecurityPolicy({ dev: true, nonce: "n" });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce / originOf", () => {
  it("makes a fresh 128-bit base64 nonce each time", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
  it("reduces a URL (or a Sentry DSN) to its origin", () => {
    expect(originOf("https://key@o1.ingest.sentry.io/42")).toBe("https://o1.ingest.sentry.io");
    expect(originOf("not a url")).toBeUndefined();
    expect(originOf(undefined)).toBeUndefined();
  });
});

describe("securityHeaders", () => {
  it("sends noindex, nosniff and a camera-only permissions policy; HSTS outside dev; no CSP (per request)", () => {
    const headers = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Permissions-Policy"]).toContain("camera=(self)");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
    expect(headers["Strict-Transport-Security"]).toBeDefined();
    expect(headers["Content-Security-Policy"]).toBeUndefined();
    expect(securityHeaders({ dev: true }).some((h) => h.key === "Strict-Transport-Security")).toBe(false);
  });
});
