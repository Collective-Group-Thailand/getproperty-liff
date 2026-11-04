// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createBffHandler } from "../src/lib/bff/handler";
import { fakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { handleMockRequest } from "./server";
import { CONDO_UNIT, UNIT_A, UNIT_B } from "./state";
import { UNIT_OTP } from "./units";

const APP = "https://app.example";
const API = "http://mock-api.invalid";

type Body = Record<string, unknown> & {
  units?: { unitId: string; unitNo: string; capabilities: string[]; roles: { role: string; source: string }[] }[];
};

/** One resident's browser over the BFF and the mock API (cookie jar), as in `mocks.test.ts`. */
function browser() {
  const jar = new Map<string, string>();
  const bff = createBffHandler({
    apiBaseUrl: API,
    upstream: handleMockRequest,
    technicianEnabled: false,
    appOrigin: APP,
  });
  return {
    async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
      const h = new Headers(headers);
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
        const name = pair!.slice(0, pair!.indexOf("="));
        if (/Max-Age=0/.test(line)) jar.delete(name);
        else jar.set(name, decodeURIComponent(pair!.slice(pair!.indexOf("=") + 1)));
      }
      const text = await response.text();
      return { status: response.status, body: (text ? JSON.parse(text) : null) as Body };
    },
    signIn(sub: string) {
      return this.call("POST", "/auth/line", { idToken: fakeLineIdToken({ sub, name: "ทดสอบ" }) });
    },
  };
}

const roles = (unit: NonNullable<Body["units"]>[number]) => unit.roles.map((r) => `${r.role}:${r.source}`).sort();

describe("JRL mock: my units and roles", () => {
  it("a tenant: occupancy + lease roles, every capability, nothing to refresh", async () => {
    const b = browser();
    await b.signIn("Umock-units-tenant");
    const { status, body } = await b.call("GET", "/v1/resident/me/units");
    expect(status).toBe(200);
    expect(body.refreshRequired).toBe(false);
    expect(body.unitsHash).toMatch(/^[0-9a-f]{64}$/);
    const [unit] = body.units!;
    expect(unit!.unitId).toBe(UNIT_A.unitId);
    expect(roles(unit!)).toEqual(["tenant:lease", "tenant:occupancy"]);
    expect(unit!.capabilities).toEqual(expect.arrayContaining(["invoices", "usage", "access", "lease", "rules"]));
  });

  it("a co-owner who does not live there: the condo unit, no lease / usage / access, bills only for it", async () => {
    const b = browser();
    await b.signIn("Umock-units-coowner");
    const { body } = await b.call("GET", "/v1/resident/me/units");
    expect(body.units!.map((u) => u.unitNo)).toEqual([CONDO_UNIT.unitNo]);
    expect(roles(body.units![0]!)).toEqual(["co_owner:ownership"]);
    expect(body.units![0]!.capabilities).not.toEqual(expect.arrayContaining(["lease"]));
    expect(body.units![0]!.capabilities).not.toContain("usage");
    const me = (await b.call("GET", "/v1/resident/me")).body;
    expect(me.units).toEqual([]);
    expect(me.entitlements).toEqual(expect.arrayContaining(["bills", "announcements", "parcels"]));
    expect(me.entitlements).not.toContain("lease");
    expect(me.scopes).toContain(`unit:${CONDO_UNIT.unitId}`);
    const invoices = (await b.call("GET", `/v1/resident/invoices?unitId=${CONDO_UNIT.unitId}`)).body as unknown as {
      data: { unitNo: string; lines: { lineKind: string }[] }[];
    };
    expect(invoices.data.length).toBeGreaterThan(0);
    expect(invoices.data.every((i) => i.unitNo === CONDO_UNIT.unitNo)).toBe(true);
    expect(invoices.data[0]!.lines.map((l) => l.lineKind)).toEqual(["common_fee", "fund"]);
    expect((await b.call("GET", `/v1/resident/units/${CONDO_UNIT.unitId}/usage`)).status).toBe(404);
  });

  it("a family member: lives there, no lease, no bills; usage of the unit by unit", async () => {
    const b = browser();
    await b.signIn("Umock-units-family");
    const [unit] = (await b.call("GET", "/v1/resident/me/units")).body.units!;
    expect(roles(unit!)).toEqual(["family:occupancy"]);
    expect(unit!.capabilities).not.toContain("invoices");
    expect(unit!.capabilities).not.toContain("lease");
    expect((await b.call("GET", "/v1/resident/invoices")).body.data).toEqual([]);
    const usage = await b.call("GET", `/v1/resident/units/${UNIT_A.unitId}/usage`);
    expect(usage.status).toBe(200);
    expect(usage.body).toMatchObject({ unitId: UNIT_A.unitId, bucket: "1d" });
    expect(usage.body).not.toHaveProperty("leaseId");
  });

  it("several units: invoices narrow to one unit with unitId", async () => {
    const b = browser();
    await b.signIn("Umock-units-multi");
    const all = (await b.call("GET", "/v1/resident/invoices?unpaid=true")).body.data as { unitId: string }[];
    expect(new Set(all.map((i) => i.unitId))).toEqual(new Set([UNIT_A.unitId, UNIT_B.unitId]));
    const one = (await b.call("GET", `/v1/resident/invoices?unpaid=true&unitId=${UNIT_B.unitId}`)).body.data as {
      unitId: string;
    }[];
    expect(one.map((i) => i.unitId)).toEqual([UNIT_B.unitId]);
  });
});

describe("JRL mock: redeeming a unit invitation", () => {
  it("preview → OTP → wrong code (attempts) → accept → refreshRequired until the token is refreshed", async () => {
    const b = browser();
    await b.signIn("Umock-units-redeem");
    const preview = await b.call("GET", "/v1/resident/unit-invitations/OWN-OK-1");
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ unitNo: CONDO_UNIT.unitNo, phoneMasked: "+66•••••1234" });
    const otp = await b.call("POST", "/v1/resident/unit-invitations/OWN-OK-1/otp");
    expect(otp.status).toBe(201);
    const challengeId = otp.body.challengeId as string;
    const wrong = await b.call(
      "POST",
      "/v1/resident/unit-invitations/OWN-OK-1/accept",
      { challengeId, code: "111111" },
      { "idempotency-key": crypto.randomUUID() },
    );
    expect(wrong.status).toBe(401);
    expect(wrong.body).toMatchObject({ code: "auth.otp_invalid", attemptsRemaining: 4 });
    const key = crypto.randomUUID();
    const accepted = await b.call(
      "POST",
      "/v1/resident/unit-invitations/OWN-OK-1/accept",
      { challengeId, code: UNIT_OTP },
      { "idempotency-key": key },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ unitId: CONDO_UNIT.unitId, refreshRequired: true });
    // A retry with the same key replays; a new attempt finds the invitation used.
    const replay = await b.call(
      "POST",
      "/v1/resident/unit-invitations/OWN-OK-1/accept",
      { challengeId, code: UNIT_OTP },
      { "idempotency-key": key },
    );
    expect(replay.body).toEqual(accepted.body);
    expect((await b.call("GET", "/v1/resident/unit-invitations/OWN-OK-1")).body).toMatchObject({
      code: "invitation.not_pending",
    });
    const before = (await b.call("GET", "/v1/resident/me/units")).body;
    expect(before.refreshRequired).toBe(true);
    expect(before.units!.map((u) => u.unitNo)).toEqual([UNIT_A.unitNo, CONDO_UNIT.unitNo]);
    expect((await b.call("POST", "/auth/refresh")).status).toBe(200);
    expect((await b.call("GET", "/v1/resident/me/units")).body.refreshRequired).toBe(false);
  });

  it("answers every invitation problem with its documented code", async () => {
    const b = browser();
    await b.signIn("Umock-units-problems");
    expect((await b.call("GET", "/v1/resident/unit-invitations/NOPE")).body).toMatchObject({
      code: "invitation.not_found",
    });
    expect((await b.call("GET", "/v1/resident/unit-invitations/OWN-USED-1")).body).toMatchObject({
      code: "invitation.not_pending",
    });
    expect((await b.call("GET", "/v1/resident/unit-invitations/OWN-NOPHONE-1")).body).toMatchObject({
      phoneMasked: null,
    });
    expect((await b.call("POST", "/v1/resident/unit-invitations/OWN-NOPHONE-1/otp")).body).toMatchObject({
      code: "invitation.phone_missing",
    });
    expect((await b.call("POST", "/v1/resident/unit-invitations/OWN-RATE-1/otp")).body).toMatchObject({
      code: "auth.otp_rate_limited",
    });
    const otp = await b.call("POST", "/v1/resident/unit-invitations/OWN-MISMATCH-1/otp");
    const mismatch = await b.call(
      "POST",
      "/v1/resident/unit-invitations/OWN-MISMATCH-1/accept",
      { challengeId: otp.body.challengeId, code: UNIT_OTP },
      { "idempotency-key": crypto.randomUUID() },
    );
    expect(mismatch.body).toMatchObject({ code: "invitation.party_mismatch" });
    const again = await b.call("POST", "/v1/resident/unit-invitations/OWN-OK-2/otp");
    const expired = await b.call(
      "POST",
      "/v1/resident/unit-invitations/OWN-OK-2/accept",
      { challengeId: again.body.challengeId, code: "000000" },
      { "idempotency-key": crypto.randomUUID() },
    );
    expect(expired.body).toMatchObject({ code: "auth.otp_expired" });
  });
});
