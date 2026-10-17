import { describe, expect, it } from "vitest";

import { routeOf, rumPayload } from "./rum";
import { rumSchema } from "./rumSchema";
import { scrubEvent, stripQuery } from "./scrub";

describe("RUM", () => {
  it("reports the route without ids, query or fragment", () => {
    expect(routeOf("/invoices/0199f2a0-0000-7000-8000-000000000001/pay?x=1#y")).toBe("/invoices/:id/pay");
    expect(routeOf("/link?code=OK-7KQ2M9")).toBe("/link");
    expect(routeOf("/receipts/RC-2569-000123")).toBe("/receipts/:id");
  });

  it("carries the LIFF context and nothing personal", () => {
    const payload = rumPayload({ name: "LCP", value: 1234.5678, rating: "good" }, "/bills", {
      inClient: true,
      os: "ios",
    });
    expect(payload).toEqual({
      name: "LCP",
      value: 1234.568,
      rating: "good",
      route: "/bills",
      inClient: true,
      os: "ios",
    });
    expect(rumPayload({ name: "NOPE", value: 1 }, "/", null)).toBeNull();
    expect(rumSchema.safeParse(payload).success).toBe(true);
    expect(rumSchema.safeParse({ ...payload, route: "/x?code=1" }).success).toBe(false);
  });
});

describe("error-report scrubbing", () => {
  it("drops cookies, bodies, users, secret headers and every query string", () => {
    const event = scrubEvent({
      request: {
        url: "https://liff.example/link?code=OK-7KQ2M9",
        cookies: { "__Host-gp_at": "x" },
        data: { idToken: "fake-line.x" },
        query_string: "code=OK",
        headers: { Authorization: "Bearer x", Cookie: "a=b", "user-agent": "Line/14" },
      },
      user: { id: "u1" },
      breadcrumbs: [{ data: { url: "/bff/v1/auth/resident/otp/verify?c=1", body: "123456" } }],
    });
    expect(event.request).toEqual({ url: "https://liff.example/link", headers: { "user-agent": "Line/14" } });
    expect(event.user).toBeUndefined();
    expect(event.breadcrumbs?.[0]?.data).toEqual({ url: "/bff/v1/auth/resident/otp/verify" });
    expect(stripQuery("/a#b")).toBe("/a");
  });
});
