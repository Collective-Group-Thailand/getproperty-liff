// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseCookieHeader } from "../src/lib/auth/cookies";
import { createBffHandler } from "../src/lib/bff/handler";
import { fakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { MOCK_INVITATION } from "./contract-requests";
import { GENERATED_OPERATIONS } from "./generated/operations";
import { OTP_CODE } from "./handlers";
import { handleMockRequest } from "./server";

const APP = "https://app.example";
const API = "http://mock-api.invalid";

/** A browser of one resident: the BFF over the mock API, with a cookie jar. */
function browser(technicianEnabled = false) {
  const jar = new Map<string, string>();
  const bff = createBffHandler({ apiBaseUrl: API, upstream: handleMockRequest, technicianEnabled, appOrigin: APP });
  return {
    jar,
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
        const [name, value] = [pair!.slice(0, pair!.indexOf("=")), pair!.slice(pair!.indexOf("=") + 1)];
        if (/Max-Age=0/.test(line)) jar.delete(name);
        else jar.set(name, decodeURIComponent(value));
      }
      const text = await response.text();
      return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
    },
    async signIn(sub: string) {
      return this.call("POST", "/auth/line", { idToken: fakeLineIdToken({ sub, name: "ทดสอบ" }) });
    },
  };
}

describe("mock API through the BFF", () => {
  it("signs a LINE resident in and serves /v1/resident/me shaped like the contract example", async () => {
    const b = browser();
    const signIn = await b.signIn("Umock-default-1");
    expect(signIn.status).toBe(200);
    expect(signIn.body).toMatchObject({ subject: { audience: "resident" } });
    expect([...b.jar.keys()].sort()).toEqual(["__Host-gp_at", "__Host-gp_rt"]);
    const me = await b.call("GET", "/v1/resident/me");
    expect(me.status).toBe(200);
    const example = GENERATED_OPERATIONS.find((o) => o.operationId === "resident.me.get")!.success.example as object;
    for (const key of Object.keys(example)) expect(me.body).toHaveProperty(key);
    expect(me.body).toMatchObject({ consentComplete: true, user: { displayName: "ทดสอบ", lineLinked: true } });
  });

  it("asks a newcomer for consent and records it (D-025)", async () => {
    const b = browser();
    await b.signIn("Umock-newcomer-2");
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({ consentComplete: false });
    const consents = await b.call("GET", "/v1/resident/consents", undefined, { "accept-language": "en" });
    const purposes = consents.body as unknown as { key: string; required: boolean; version: number; granted: null }[];
    expect(purposes.map((p) => [p.key, p.required, p.granted])).toEqual([
      ["resident.service", true, null],
      ["resident.marketing", false, null],
    ]);
    const captured = await b.call("POST", "/v1/resident/consents", {
      language: "en",
      items: purposes.map((p) => ({ purposeKey: p.key, version: p.version, granted: p.required })),
    });
    expect(captured.status).toBe(201);
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({ consentComplete: true });
    const unknown = await b.call("POST", "/v1/resident/consents", {
      items: [{ purposeKey: "x", version: 1, granted: true }],
    });
    expect(unknown.body).toMatchObject({ code: "consent.unknown_purpose" });
  });

  it("accepts an invitation once and explains used and unknown codes (CONTRACT-REQUEST #1)", async () => {
    const b = browser();
    await b.signIn("Umock-invitee-3");
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({ units: [] });
    const linked = await b.call("POST", "/v1/resident/link", { code: MOCK_INVITATION.valid });
    expect(linked.status).toBe(200);
    expect((linked.body as { units: { unitNo: string }[] }).units[0]!.unitNo).toBe("A-201");
    expect((await b.call("POST", "/v1/resident/link", { code: MOCK_INVITATION.valid })).body).toMatchObject({
      code: "invitation.not_pending",
    });
    expect((await b.call("POST", "/v1/resident/link", { code: MOCK_INVITATION.expired })).status).toBe(409);
    expect((await b.call("POST", "/v1/resident/link", { code: "NOPE-1234" })).body).toMatchObject({
      status: 404,
      code: "invitation.not_found",
    });
  });

  it("signs in by SMS code with attempts left on a wrong code", async () => {
    const b = browser();
    const challenge = await b.call("POST", "/v1/auth/resident/otp/request", { phone: "0810001234" });
    expect(challenge.status).toBe(200);
    const challengeId = challenge.body!.challengeId as string;
    const wrong = await b.call("POST", "/v1/auth/resident/otp/verify", { challengeId, code: "999999" });
    expect(wrong).toMatchObject({ status: 401, body: { code: "auth.otp_invalid", attemptsRemaining: 4 } });
    const ok = await b.call("POST", "/v1/auth/resident/otp/verify", { challengeId, code: OTP_CODE });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain("mock-rt.");
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({
      user: { phone: "+66810001234", lineLinked: false },
    });
    const invalid = await b.call("POST", "/v1/auth/resident/otp/request", { phone: "12" });
    expect(invalid).toMatchObject({ status: 422, body: { code: "validation.failed" } });
  });

  it("rotates refresh tokens and revokes the sign-in on reuse, like the API (D-163)", async () => {
    const b = browser();
    await b.signIn("Umock-rotation-4");
    const first = b.jar.get("__Host-gp_rt")!;
    const refresh = (token: string) =>
      handleMockRequest(
        new Request(`${API}/v1/auth/refresh`, { method: "POST", body: JSON.stringify({ refreshToken: token }) }),
      );
    expect((await refresh(first)).status).toBe(200);
    const reused = await refresh(first);
    expect(reused.status).toBe(401);
    expect(((await reused.json()) as { code: string }).code).toBe("auth.refresh_reused");
  });

  it("refuses an account the operator disabled", async () => {
    const result = await browser().signIn("Umock-disabled-5");
    expect(result).toMatchObject({ status: 403, body: { code: "auth.account_disabled" } });
  });

  it("forces any documented problem with the x-gp-mock scenario header", async () => {
    const b = browser();
    await b.signIn("Umock-forced-6");
    const access = b.jar.get("__Host-gp_at")!;
    const response = await handleMockRequest(
      new Request(`${API}/v1/resident/me`, {
        headers: { authorization: `Bearer ${access}`, "x-gp-mock": "resident.me.get=internal.unexpected" },
      }),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { code: string; requestId: string };
    expect(body.code).toBe("internal.unexpected");
    expect(body.requestId).toBeTruthy();
  });

  it("answers every resident and technician operation of the contract (no unmocked endpoint)", async () => {
    const resident = browser(true);
    await resident.signIn("Umock-coverage-7");
    const technician = browser(true);
    await technician.call("POST", "/auth/technician/line", { idToken: fakeLineIdToken({ sub: "Utech-8" }) });
    for (const op of GENERATED_OPERATIONS.filter((o) => /^\/v1\/(resident|technician)\//.test(o.path))) {
      if (op.operationId === "resident.realtime.stream") continue;
      const who = op.path.startsWith("/v1/technician/") ? technician : resident;
      const path = op.path.replace(/\{[^}]+\}/g, "3b241101-e2bb-4255-8caf-4136c566a962");
      const result = await who.call(op.method, path, op.method === "GET" ? undefined : {}, {
        "idempotency-key": "3b241101-e2bb-4255-8caf-4136c566a962",
      });
      expect(result.status, `${op.operationId} ${JSON.stringify(result.body)}`).toBeLessThan(500);
      expect(result.body?.code, op.operationId).not.toBe("http.not_found");
    }
  });

  it("rejects a token of another audience on the resident surface", async () => {
    const technician = browser(true);
    await technician.call("POST", "/auth/technician/line", { idToken: fakeLineIdToken({ sub: "Utech-9" }) });
    const access = parseCookieHeader(`a=${technician.jar.get("__Host-gp_tat")}`).get("a")!;
    const response = await handleMockRequest(
      new Request(`${API}/v1/resident/me`, { headers: { authorization: `Bearer ${access}` } }),
    );
    expect(response.status).toBe(403);
  });
});
