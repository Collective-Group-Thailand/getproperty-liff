// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createBffHandler } from "../src/lib/bff/handler";
import { fakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { handleMockRequest } from "./server";

const APP = "https://app.example";
const API = "http://mock-api.invalid";

/** One browser through the BFF over the mock API; `scenario` is the `gp_mock` cookie (sent upstream as `x-gp-mock`). */
function browser() {
  let scenario = "";
  const jar = new Map<string, string>();
  const bff = createBffHandler({
    apiBaseUrl: API,
    upstream: handleMockRequest,
    technicianEnabled: false,
    appOrigin: APP,
    upstreamHeaders: (): Record<string, string> => (scenario ? { "x-gp-mock": scenario } : {}),
  });
  const call = async (method: string, path: string, body?: unknown, language = "th") => {
    const h = new Headers({ "accept-language": language });
    h.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (method !== "GET") {
      h.set("origin", APP);
      h.set("x-getproperty-csrf", "1");
      h.set("content-type", "application/json");
    }
    const response = await bff(
      new Request(`${APP}/bff${path}`, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      jar.set(pair!.slice(0, pair!.indexOf("=")), decodeURIComponent(pair!.slice(pair!.indexOf("=") + 1)));
    }
    const text = await response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: (text ? JSON.parse(text) : null) as any };
  };
  return {
    call,
    scenario: (next: string) => {
      scenario = next;
    },
    resident: (sub: string) => call("POST", "/auth/line", { idToken: fakeLineIdToken({ sub, name: "Somsri" }) }),
    prospect: (sub: string) => call("POST", "/auth/prospect/line", { idToken: fakeLineIdToken({ sub, name: "Nok" }) }),
  };
}

const PREFS = {
  areas: ["ari", "chatuchak"],
  budgetMin: "8000",
  budgetMax: "15000",
  unitKinds: ["condo_unit"],
  moveInFrom: "2026-12-01",
  moveInTo: "2027-01-31",
  language: "th",
  quietHours: null,
};

describe("recommended places (GL1, api G6, D-300)", () => {
  it("is never granted by default and refuses preferences without an explicit grant", async () => {
    const b = browser();
    await b.prospect("Umock-gl1-default");
    const view = await b.call("GET", "/v1/prospect/me/recommendations");
    expect(view.status).toBe(200);
    expect(view.body.consent).toMatchObject({
      purposeKey: "platform.recommendations",
      granted: false,
      grantedVersion: null,
    });
    expect(view.body.consent.bodyMarkdown).toContain("profiling");
    expect(view.body.preferences).toBeNull();
    expect(view.body).toMatchObject({ maxPerWeek: 2, quietHours: { start: "21:00", end: "08:00" } });
    const refused = await b.call("PUT", "/v1/prospect/me/recommendations", { preferences: PREFS });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("recommendations.consent_required");
  });

  it("shows the text in Thai for Thai and in English for every other language", async () => {
    const b = browser();
    await b.prospect("Umock-gl1-lang");
    expect((await b.call("GET", "/v1/prospect/me/recommendations", undefined, "th")).body.consent.language).toBe("th");
    for (const language of ["en", "my", "km", "lo", "zh"]) {
      const view = await b.call("GET", "/v1/prospect/me/recommendations", undefined, language);
      expect(view.body.consent, language).toMatchObject({ language: "en" });
    }
  });

  it("opts in with the version, keeps the grant on later saves and is the same person on both surfaces", async () => {
    const b = browser();
    await b.prospect("Umock-gl1-both");
    const saved = await b.call("PUT", "/v1/prospect/me/recommendations", { consentVersion: 1, preferences: PREFS });
    expect(saved.status).toBe(200);
    expect(saved.body.consent).toMatchObject({ granted: true, grantedVersion: 1 });
    expect(saved.body.preferences).toMatchObject({
      areas: ["ari", "chatuchak"],
      budgetMin: "8000.00",
      budgetMax: "15000.00",
    });
    const again = await b.call("PUT", "/v1/prospect/me/recommendations", {
      preferences: { ...PREFS, quietHours: { start: "22:00", end: "07:00" } },
    });
    expect(again.body.preferences.quietHours).toEqual({ start: "22:00", end: "07:00" });
    await b.resident("Umock-gl1-both");
    const resident = await b.call("GET", "/v1/resident/me/recommendations");
    expect(resident.body.consent.granted).toBe(true);
  });

  it("answers a new text version with consent_outdated and asks again", async () => {
    const b = browser();
    await b.prospect("Umock-gl1-outdated");
    await b.call("PUT", "/v1/prospect/me/recommendations", { consentVersion: 1, preferences: PREFS });
    b.scenario("recommendations.version=2");
    const view = await b.call("GET", "/v1/prospect/me/recommendations");
    expect(view.body.consent).toMatchObject({ version: 2, granted: false, grantedVersion: 1 });
    expect(view.body.preferences).toBeNull();
    const stale = await b.call("PUT", "/v1/prospect/me/recommendations", { consentVersion: 1, preferences: PREFS });
    expect(stale.body.code).toBe("recommendations.consent_outdated");
    const kept = await b.call("PUT", "/v1/prospect/me/recommendations", { preferences: PREFS });
    expect(kept.body.code).toBe("recommendations.consent_outdated");
    const renewed = await b.call("PUT", "/v1/prospect/me/recommendations", { consentVersion: 2, preferences: PREFS });
    expect(renewed.body.consent).toMatchObject({ granted: true, grantedVersion: 2 });
  });

  it("refuses unknown areas and inverted ranges at the field (422)", async () => {
    const b = browser();
    await b.resident("Umock-gl1-invalid");
    const bad = await b.call("PUT", "/v1/resident/me/recommendations", {
      consentVersion: 1,
      preferences: { ...PREFS, areas: ["ari", "atlantis"], budgetMin: "15000", budgetMax: "8000" },
    });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("validation.failed");
    expect(bad.body.errors.map((e: { path: string }) => e.path)).toEqual([
      "preferences.areas[1]",
      "preferences.budgetMax",
    ]);
    expect((await b.call("GET", "/v1/resident/me/recommendations")).body.consent.granted).toBe(false);
  });

  it("withdraws in one tap: granted false, preferences gone, repeating changes nothing", async () => {
    const b = browser();
    await b.resident("Umock-gl1-withdraw");
    await b.call("PUT", "/v1/resident/me/recommendations", { consentVersion: 1, preferences: PREFS });
    const stopped = await b.call("POST", "/v1/resident/me/recommendations/actions/withdraw");
    expect(stopped.status).toBe(200);
    expect(stopped.body.consent).toMatchObject({ granted: false, grantedVersion: null });
    expect(stopped.body.preferences).toBeNull();
    const twice = await b.call("POST", "/v1/resident/me/recommendations/actions/withdraw");
    expect(twice.body.consent.granted).toBe(false);
    const after = await b.call("PUT", "/v1/resident/me/recommendations", { preferences: PREFS });
    expect(after.body.code).toBe("recommendations.consent_required");
  });

  it("pages what was sent (ad label, sponsor, listings no longer public) and lists the public areas", async () => {
    const b = browser();
    await b.prospect("Umock-gl1-adsseen");
    const first = await b.call("GET", "/v1/prospect/me/recommendations/history?page=1&perPage=3");
    expect(first.body.meta).toEqual({ page: 1, perPage: 3, total: 4 });
    expect(first.body.data[0]).toMatchObject({ label: "โฆษณา", sponsor: "มาลี มีสุข" });
    expect(first.body.data[1].listings[0]).toMatchObject({ public: false });
    const english = await b.call("GET", "/v1/prospect/me/recommendations/history?page=2&perPage=3", undefined, "en");
    expect(english.body.data).toHaveLength(1);
    expect(english.body.data[0].label).toBe("Sponsored");
    const none = browser();
    await none.prospect("Umock-gl1-nothing");
    expect((await none.call("GET", "/v1/prospect/me/recommendations/history")).body.meta.total).toBe(0);
    const areas = await b.call("GET", "/v1/public/listings/areas");
    expect(areas.status).toBe(200);
    expect(areas.body.data.map((a: { slug: string }) => a.slug)).toContain("ari");
  });

  it("links an agency's OA for a prospect through the prospect endpoints (G4)", async () => {
    const b = browser();
    await b.prospect("Umock-gl1-oa");
    const preview = await b.call("GET", "/v1/prospect/messaging-links/mock-oa-valid-gl1");
    expect(preview.body).toMatchObject({ state: "valid" });
    const linked = await b.call("POST", "/v1/prospect/messaging-links/mock-oa-valid-gl1/actions/confirm");
    expect(linked.body).toMatchObject({ state: "used" });
    const again = await b.call("POST", "/v1/prospect/messaging-links/mock-oa-valid-gl1/actions/confirm");
    expect(again.body.code).toBe("messaging.link_used");
    expect((await b.call("GET", "/v1/resident/messaging-links/mock-oa-valid-gl1")).status).toBe(401);
  });
});
