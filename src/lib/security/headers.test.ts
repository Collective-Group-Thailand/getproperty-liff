import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy();

  it("allows the LIFF SDK and LINE's APIs, and nothing else third-party", () => {
    expect(directive(csp, "script-src")).toContain("https://static.line-scdn.net");
    expect(directive(csp, "connect-src")).toContain("https://api.line.me");
    expect(directive(csp, "connect-src")).toContain("https://liffsdk.line-scdn.net");
    expect(directive(csp, "form-action")).toContain("https://access.line.me");
    expect(csp).not.toMatch(/googleapis|gstatic|\*\s|https:\s/);
  });

  it("refuses plugins, foreign frames and base-tag injection", () => {
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-src")).toBe("frame-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "frame-ancestors")).toContain("https://liff.line.me");
  });

  it("only allows eval and websockets in development", () => {
    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
    expect(csp).toContain("upgrade-insecure-requests");
    const dev = contentSecurityPolicy({ dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("securityHeaders", () => {
  it("sends noindex, nosniff and a camera-only permissions policy; HSTS outside dev", () => {
    const headers = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Permissions-Policy"]).toContain("camera=(self)");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
    expect(headers["Strict-Transport-Security"]).toBeDefined();
    expect(securityHeaders({ dev: true }).some((h) => h.key === "Strict-Transport-Security")).toBe(false);
  });
});
