// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createBffHandler } from "../src/lib/bff/handler";
import { fakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { MOCK_LISTING_SLUG } from "./prospect";
import { carriesPersonalData } from "./reviews";
import { handleMockRequest } from "./server";

const APP = "https://app.example";
const API = "http://mock-api.invalid";

/** One browser through the BFF over the mock API (as `recommendations.test.ts`). */
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
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const h = new Headers({ "accept-language": "th", ...headers });
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
  };
}

const key = () => ({ "idempotency-key": crypto.randomUUID() });

async function relocationConsent(b: ReturnType<typeof browser>, granted: boolean) {
  const res = await b.call("POST", "/v1/resident/consents", {
    items: [{ purposeKey: "resident.relocation", version: 1, granted }],
  });
  expect(res.status).toBe(201);
}

describe("relocation offers (GL4, api G8, D-299)", () => {
  it("opens an offer only for a lease under notice while consented; withdrawal closes it and erases the destination", async () => {
    const b = browser();
    await b.resident("Umock-gl4-moveout-1");
    const purposes = (await b.call("GET", "/v1/resident/consents")).body as { key: string; granted: unknown }[];
    expect(purposes.find((p) => p.key === "resident.relocation")).toMatchObject({ granted: null });
    expect((await b.call("GET", "/v1/resident/relocation-offers")).body).toEqual({ consented: false, data: [] });

    await relocationConsent(b, true);
    const offers = (await b.call("GET", "/v1/resident/relocation-offers")).body;
    expect(offers.consented).toBe(true);
    expect(offers.data).toHaveLength(1);
    const offer = offers.data[0];
    expect(offer).toMatchObject({ state: "open", destination: null, listings: [], unitNo: "A-201" });

    const missing = await b.call("PUT", `/v1/resident/relocation-offers/${offer.id}/destination`, { maxRent: "9000" });
    expect(missing.body).toMatchObject({ code: "validation.failed", errors: [{ path: "areaSlug" }] });
    const set = await b.call("PUT", `/v1/resident/relocation-offers/${offer.id}/destination`, {
      areaSlug: "ari",
      maxRent: "16000",
    });
    expect(set.body.destination).toEqual({ areaSlug: "ari", province: null, district: null, maxRent: "16000.00" });
    expect(set.body.listings.map((l: { slug: string }) => l.slug)).toEqual([
      MOCK_LISTING_SLUG,
      "room-studio-b7c8d9e0f1",
    ]);
    const byDistrict = await b.call("PUT", `/v1/resident/relocation-offers/${offer.id}/destination`, {
      province: "กรุงเทพมหานคร",
      district: "จตุจักร",
      maxRent: "10000",
    });
    expect(byDistrict.body.listings.map((l: { slug: string }) => l.slug)).toEqual(["room-studio-d4e5f6a7b8"]);

    await relocationConsent(b, false);
    const refused = await b.call("PUT", `/v1/resident/relocation-offers/${offer.id}/destination`, { areaSlug: "ari" });
    expect(refused.body).toMatchObject({ code: "relocation.consent_required" });
    const gone = (await b.call("GET", "/v1/resident/relocation-offers")).body;
    expect(gone).toMatchObject({ consented: false, data: [{ state: "withdrawn", destination: null, listings: [] }] });
  });

  it("enquires as a prospect and shares the rent record only when asked; dismiss closes the offer", async () => {
    const b = browser();
    await b.resident("Umock-gl4-moveout-2");
    await relocationConsent(b, true);
    const offer = (await b.call("GET", "/v1/resident/relocation-offers")).body.data[0];
    await b.call("PUT", `/v1/resident/relocation-offers/${offer.id}/destination`, { areaSlug: "ari" });
    const path = `/v1/resident/relocation-offers/${offer.id}/actions/enquire`;
    const body = { listingSlug: MOCK_LISTING_SLUG, message: "สนใจห้องนี้ค่ะ", shareRentRecord: false, consent: true };

    expect((await b.call("POST", path, body)).body).toMatchObject({ code: "idempotency.key_required" });
    expect((await b.call("POST", path, { ...body, consent: false }, key())).body).toMatchObject({
      code: "listing.consent_required",
    });
    const k = key();
    const first = await b.call("POST", path, body, k);
    expect(first.body).toMatchObject({ created: true, rentRecordShared: false });
    expect((await b.call("POST", path, body, k)).body).toEqual(first.body);
    expect((await b.call("GET", "/v1/resident/me/rent-record")).body.shares).toEqual([]);

    const shared = await b.call(
      "POST",
      path,
      { ...body, message: "ส่งประวัติค่าเช่าด้วยค่ะ", shareRentRecord: true },
      key(),
    );
    expect(shared.body).toMatchObject({ created: false, rentRecordShared: true, leadId: first.body.leadId });
    const record = (await b.call("GET", "/v1/resident/me/rent-record")).body;
    expect(record.shares).toEqual([
      expect.objectContaining({ kind: "enquiry", lead: expect.objectContaining({ id: first.body.leadId }) }),
    ]);
    const after = (await b.call("GET", "/v1/resident/relocation-offers")).body.data[0];
    expect(after.enquiredListingIds).toEqual([first.body.listingId]);

    const dismissed = await b.call("POST", `/v1/resident/relocation-offers/${offer.id}/actions/dismiss`);
    expect(dismissed.body).toMatchObject({ state: "dismissed", destination: null });
    expect((await b.call("POST", `/v1/resident/relocation-offers/${offer.id}/actions/dismiss`)).body).toMatchObject({
      code: "relocation.invalid_state",
    });
  });

  it("has no offer for a lease without notice, even when consented", async () => {
    const b = browser();
    await b.resident("Umock-gl4-plain-3");
    await relocationConsent(b, true);
    expect((await b.call("GET", "/v1/resident/relocation-offers")).body).toEqual({ consented: true, data: [] });
  });
});

describe("verified reviews (GL4, api G9, D-301)", () => {
  async function leaseId(b: ReturnType<typeof browser>) {
    return ((await b.call("GET", "/v1/resident/leases")).body as { id: string }[])[0]!.id;
  }

  it("is too early by default, with the first eligible day and the consent text never assumed", async () => {
    const b = browser();
    await b.resident("Umock-gl4-early-4");
    const id = await leaseId(b);
    const view = (await b.call("GET", `/v1/resident/leases/${id}/review`)).body;
    expect(view.eligibility).toMatchObject({ eligible: false, reason: "too_early", eligibleFrom: "2027-02-01" });
    expect(view).toMatchObject({ review: null, consent: { purposeKey: "review.publish", version: 1 } });
    const english = await b.call("GET", `/v1/resident/leases/${id}/review`, undefined, { "accept-language": "en" });
    expect(english.body.consent.title).toBe("Publish my building review");
    const refused = await b.call(
      "POST",
      `/v1/resident/leases/${id}/review`,
      { rating: 4, body: "ตึกสะอาด ลิฟต์เร็ว", consentVersion: 1 },
      key(),
    );
    expect(refused.body).toMatchObject({ code: "review.not_eligible", reviewEligibleFrom: "2027-02-01" });
  });

  it("submits with the consent version, refuses personal data, waits for moderation, withdraws for good", async () => {
    const b = browser();
    await b.resident("Umock-gl4-reviewer-5");
    const id = await leaseId(b);
    const path = `/v1/resident/leases/${id}/review`;
    const body = { rating: 4, body: "ตึกสะอาด ลิฟต์เร็ว นิติฯ ตอบไว", language: "th", consentVersion: 1 };
    expect((await b.call("POST", path, { ...body, consentVersion: 2 }, key())).body).toMatchObject({
      code: "review.consent_required",
    });
    expect((await b.call("POST", path, { ...body, body: "โทรมาที่ 081-234-5678 นะคะ" }, key())).body).toMatchObject({
      code: "review.personal_data",
    });
    expect((await b.call("POST", path, { ...body, body: "สั้น" }, key())).body).toMatchObject({
      code: "validation.failed",
    });
    const k = key();
    const created = await b.call("POST", path, body, k);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      state: "pending_moderation",
      rating: 4,
      tenure: { from: "2025-11", to: null },
    });
    expect((await b.call("POST", path, body, k)).body).toEqual(created.body);
    expect((await b.call("POST", path, body, key())).body).toMatchObject({ code: "review.already_submitted" });

    await b.call("POST", `/v1/resident/__mock/reviews/${id}/moderate`, { decision: "approve", reply: "ขอบคุณค่ะ" });
    expect((await b.call("GET", path)).body.review).toMatchObject({ state: "published", ownerReply: "ขอบคุณค่ะ" });

    const withdrawn = await b.call("POST", `${path}/actions/withdraw`);
    expect(withdrawn.body).toMatchObject({ state: "withdrawn", body: null });
    expect((await b.call("POST", `${path}/actions/withdraw`)).body).toMatchObject({ state: "withdrawn" });
  });

  it("screens contact data like the API (phones, e-mail, links, LINE ids, ID numbers; not a BTS line)", () => {
    expect(carriesPersonalData("ติดต่อ 0812345678")).toBe(true);
    expect(carriesPersonalData("โทร ๐๘๑-๒๓๔-๕๖๗๘")).toBe(true);
    expect(carriesPersonalData("mail me a@b.co")).toBe(true);
    expect(carriesPersonalData("ดูที่ www.example.com")).toBe(true);
    expect(carriesPersonalData("line id: somsri99")).toBe(true);
    expect(carriesPersonalData("เลขบัตร 1 1037 02071 81 1")).toBe(true);
    expect(carriesPersonalData("ใกล้ BTS line สีเขียว เดิน 5 นาที ห้อง 12 ตร.ม.")).toBe(false);
  });
});
