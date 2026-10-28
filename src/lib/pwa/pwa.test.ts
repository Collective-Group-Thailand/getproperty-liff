import { describe, expect, it } from "vitest";

import { cacheDecision } from "./cachePolicy";
import { pushSupported, vapidKeyBytes } from "./push";

const SELF = "https://liff.getproperty.co";
const at = (path: string, origin = SELF) => new URL(path, origin);

describe("service worker cache policy (app shell only)", () => {
  it("caches hashed static assets, fonts, icons and the offline page", () => {
    expect(cacheDecision(at("/_next/static/chunks/app.js"), SELF, "no-cors")).toBe("static");
    expect(cacheDecision(at("/icons/icon-192.png"), SELF, "no-cors")).toBe("static");
    expect(cacheDecision(at("/offline.html"), SELF, "same-origin")).toBe("static");
  });

  it("never caches pages, the BFF (invoices, receipts, personal data) or other origins", () => {
    expect(cacheDecision(at("/"), SELF, "navigate")).toBe("offline-fallback");
    expect(cacheDecision(at("/bills"), SELF, "navigate")).toBe("offline-fallback");
    expect(cacheDecision(at("/bff/v1/resident/me"), SELF, "cors")).toBe("network-only");
    expect(cacheDecision(at("/bff/v1/resident/receipts/1/pdf"), SELF, "navigate")).toBe("network-only");
    expect(cacheDecision(at("/_next/static/x.js", "https://evil.example"), SELF, "no-cors")).toBe("network-only");
    expect(cacheDecision(at("/manifest.webmanifest"), SELF, "same-origin")).toBe("network-only");
  });

  it("never caches a self-viewing door code (GL2, D-295)", () => {
    expect(cacheDecision(at("/bff/v1/prospect/viewings/1/access-code"), SELF, "cors")).toBe("network-only");
    expect(cacheDecision(at("/bff/v1/prospect/viewings/1/access-code"), SELF, "same-origin")).toBe("network-only");
  });
});

describe("web push", () => {
  it("is never offered inside LINE or without a VAPID key", () => {
    expect(pushSupported(undefined, false)).toBe(false);
    expect(pushSupported("BKey", true)).toBe(false);
  });
  it("decodes a base64url VAPID key", () => {
    expect([...vapidKeyBytes("AQID")]).toEqual([1, 2, 3]);
    expect(vapidKeyBytes("_-8").length).toBe(2);
  });
});
