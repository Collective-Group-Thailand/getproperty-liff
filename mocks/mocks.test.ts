// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseCookieHeader } from "../src/lib/auth/cookies";
import { createBffHandler } from "../src/lib/bff/handler";
import { fakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { MOCK_CONTRACT_SHA, SIGNATURE_OTP } from "./residence";
import { MOCK_INVITATION } from "./resident";
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

  it("accepts an invitation once, after consent, and explains used and unknown codes (D-061)", async () => {
    const b = browser();
    await b.signIn("Umock-invitee-3");
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({ units: [] });
    expect((await b.call("POST", "/v1/resident/link", { code: MOCK_INVITATION.valid })).body).toMatchObject({
      code: "consent.required",
    });
    await b.call("POST", "/v1/resident/consents", {
      items: [{ purposeKey: "resident.service", version: 1, granted: true }],
    });
    const linked = await b.call("POST", "/v1/resident/link", { code: MOCK_INVITATION.valid });
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ refreshRequired: true });
    expect((linked.body as { units: { unitNo: string }[] }).units[0]!.unitNo).toBe("A-201");
    const lease = await b.call("POST", "/v1/resident/link", { code: MOCK_INVITATION.lease });
    expect(lease.body).toMatchObject({ units: [] });
    expect((await b.call("GET", `/v1/resident/leases/${String(lease.body!.leaseId)}`)).body).toMatchObject({
      status: "pending_signature",
    });
    expect((await b.call("POST", "/auth/refresh")).status).toBe(200);
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
      // A documented 404 of a stateful mock (an id the account does not have) is fine; an unmocked path is not.
      expect(String(result.body?.detail ?? ""), op.operationId).not.toMatch(/^No mock for/);
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

  it("L3: signs a lease with the OTP, the contract hash and a PNG, once per Idempotency-Key", async () => {
    const b = browser();
    await b.signIn("Umock-signer-20");
    const [lease] = (await b.call("GET", "/v1/resident/leases")).body as unknown as { id: string }[];
    const path = `/v1/resident/leases/${lease!.id}`;
    expect((await b.call("GET", path)).body).toMatchObject({ signatureRequired: true, rulesAcknowledgedAt: null });
    const contract = await b.call("GET", `${path}/contract`);
    expect(contract.body).toMatchObject({ sha256: MOCK_CONTRACT_SHA, signed: false });
    const otp = await b.call("POST", `${path}/signature/otp`, {});
    const challengeId = otp.body!.challengeId as string;
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const sign = (code: string, key: string | null, sha = MOCK_CONTRACT_SHA) =>
      b.call(
        "POST",
        `${path}/sign`,
        { challengeId, code, contractSha256: sha, signaturePng: png },
        key ? { "idempotency-key": key } : {},
      );
    expect((await sign(SIGNATURE_OTP, null)).body).toMatchObject({ code: "idempotency.key_required" });
    expect((await sign(SIGNATURE_OTP, crypto.randomUUID(), "a".repeat(64))).body).toMatchObject({
      code: "lease.contract_changed",
    });
    expect((await sign("000001", crypto.randomUUID())).body).toMatchObject({ code: "auth.otp_invalid" });
    const key = crypto.randomUUID();
    const signed = await sign(SIGNATURE_OTP, key);
    expect(signed).toMatchObject({ status: 200, body: { signatureRequired: false, status: "pending_signature" } });
    expect((await sign(SIGNATURE_OTP, key)).body).toEqual(signed.body);
    const ack = await b.call("POST", `${path}/rules/acknowledge`);
    expect(ack.body!.rulesAcknowledgedAt).toEqual(expect.any(String));
  });

  it("L3: a notice before the API's earliest date is refused with its legal reference", async () => {
    const b = browser();
    await b.signIn("Umock-notice-21");
    const [lease] = (await b.call("GET", "/v1/resident/leases")).body as unknown as {
      id: string;
      noticeEarliestDate: string;
    }[];
    const early = await b.call("POST", `/v1/resident/leases/${lease!.id}/notice`, { effectiveDate: "2020-01-01" });
    expect(early).toMatchObject({ status: 422, body: { code: "compliance.notice_period" } });
    expect(early.body!.legalRef).toEqual(expect.any(String));
    const ok = await b.call("POST", `/v1/resident/leases/${lease!.id}/notice`, {
      effectiveDate: lease!.noticeEarliestDate,
    });
    expect(ok.body).toMatchObject({ status: "notice_given", notice: { effectiveDate: lease!.noticeEarliestDate } });
  });

  it("L3: disputes a proposed settlement with uploaded photos; usage series for IoT units", async () => {
    const b = browser();
    await b.signIn("Umock-moveout-22");
    const [deposit] = (await b.call("GET", "/v1/resident/deposits")).body as unknown as {
      id: string;
      leaseId: string;
      deductions: { beforeEvidenceUrls: string[] }[];
    }[];
    expect(deposit!.deductions[0]!.beforeEvidenceUrls).toHaveLength(1);
    const upload = await b.call("POST", "/v1/resident/uploads", {
      purpose: "deposit_dispute",
      contentType: "image/jpeg",
      sizeBytes: 3,
    });
    const fileId = upload.body!.fileId as string;
    expect(
      (
        await b.call("POST", `/v1/resident/deposits/${deposit!.id}/actions/dispute`, {
          reason: "รอยมีก่อนเข้าพัก",
          photoDocumentIds: [fileId],
        })
      ).body,
    ).toMatchObject({ code: "validation.failed" });
    expect((await b.call("PUT", `/v1/resident/uploads/${fileId}/content`, "abc")).status).toBe(200);
    const disputed = await b.call("POST", `/v1/resident/deposits/${deposit!.id}/actions/dispute`, {
      reason: "รอยมีก่อนเข้าพัก",
      photoDocumentIds: [fileId],
    });
    expect(disputed.body).toMatchObject({ status: "disputed", settlement: { residentResponse: "disputed" } });
    const usage = await b.call("GET", `/v1/resident/leases/${deposit!.leaseId}/usage?bucket=1d`);
    const series = usage.body!.series as { utility: string; points: unknown[] }[];
    expect(series.map((s) => s.utility)).toEqual(["electric", "water"]);
    expect(series[0]!.points.length).toBeGreaterThanOrEqual(30);
  });
});

describe("Lighthouse URLs of mock leases", () => {
  it("match the ids the mock derives from the seeded subjects (lighthouse/*.json)", async () => {
    const { readFileSync } = await import("node:fs");
    const { mockLeaseId } = await import("./residence");
    const urls = ["resident", "resident-sign"].flatMap(
      (set) =>
        (
          JSON.parse(readFileSync(new URL(`../lighthouse/${set}.json`, import.meta.url), "utf8")) as {
            ci: { collect: { url: string[] } };
          }
        ).ci.collect.url,
    );
    expect(urls).toContain(`http://localhost:3400/lease/${mockLeaseId("line:Ulighthouse-resident", 0)}/notice`);
    expect(urls).toContain(`http://localhost:3400/lease/${mockLeaseId("line:Ulighthouse-signer", 0)}/sign`);
    const { currentInvoiceId } = await import("./billing");
    expect(urls).toContain(`http://localhost:3400/invoices/${currentInvoiceId("line:Ulighthouse-resident")}`);
  });
});

describe("L2 billing mocks follow the contract", () => {
  const keysOf = (operationId: string) => {
    const op = GENERATED_OPERATIONS.find((o) => o.operationId === operationId)!;
    return Object.keys(op.success.example as Record<string, unknown>);
  };

  it("serves invoices, the payment (a valid Thai QR) and receipts with every key of the contract examples", async () => {
    const b = browser();
    await b.signIn("Umock-billing-1");
    const list = await b.call("GET", "/v1/resident/invoices?unpaid=true");
    const [open] = list.body!.data as Record<string, unknown>[];
    for (const key of keysOf("resident.invoices.get")) expect(open).toHaveProperty(key);
    expect(open!.id).toBe((await import("./billing")).currentInvoiceId("line:Umock-billing-1"));
    const payment = await b.call("GET", `/v1/resident/invoices/${open!.id as string}/payment`);
    for (const key of keysOf("resident.invoices.payment")) expect(payment.body).toHaveProperty(key);
    const qr = payment.body!.qr as { payload: string; amount: string; reference: string };
    expect(qr.amount).toBe(open!.balance);
    expect(qr.payload).toContain(qr.reference);
    const { thaiQrPayload } = await import("./billing");
    expect(qr.payload).toBe(thaiQrPayload(qr.reference, qr.amount));
    const receipts = await b.call("GET", "/v1/resident/receipts");
    for (const key of keysOf("resident.receipts.list")) expect(receipts.body).toHaveProperty(key);
    expect((receipts.body!.data as unknown[]).length).toBe(2);
  });

  it("verifies a slip like the API (amount, account, duplicate) and replays an Idempotency-Key", async () => {
    const b = browser();
    await b.signIn("Umock-slips-2");
    const [open] = (await b.call("GET", "/v1/resident/invoices?unpaid=true")).body!.data as {
      id: string;
      balance: string;
    }[];
    const slip = (amount: string, transRef: string) =>
      Buffer.concat([
        Buffer.from("89504e47", "hex"),
        Buffer.from(JSON.stringify({ transRef, amount, receiverAccount: "xxx1234" })),
      ]).toString("base64");
    const key = crypto.randomUUID();
    const first = await b.call(
      "POST",
      `/v1/resident/invoices/${open!.id}/slips`,
      { image: slip("100.00", "T1"), mimeType: "image/png" },
      { "idempotency-key": key },
    );
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: "pending_verification" });
    const replay = await b.call(
      "POST",
      `/v1/resident/invoices/${open!.id}/slips`,
      { image: slip("100.00", "T1"), mimeType: "image/png" },
      { "idempotency-key": key },
    );
    expect(replay.body!.id).toBe(first.body!.id);
    await new Promise((r) => setTimeout(r, 1400));
    const again = await b.call("POST", `/v1/resident/invoices/${open!.id}/slips`, {
      image: slip("100.00", "T1"),
      mimeType: "image/png",
    });
    await new Promise((r) => setTimeout(r, 1400));
    const slips = (await b.call("GET", `/v1/resident/invoices/${open!.id}/slips`)).body!.data as {
      id: string;
      status: string;
      reasons: string[];
    }[];
    expect(slips.find((s) => s.id === first.body!.id)).toMatchObject({
      status: "pending_review",
      reasons: ["amount_below_due"],
    });
    expect(slips.find((s) => s.id === again.body!.id)).toMatchObject({ status: "duplicate" });
    const good = await b.call("POST", `/v1/resident/invoices/${open!.id}/slips`, {
      image: slip(open!.balance, "T2"),
      mimeType: "image/png",
    });
    await new Promise((r) => setTimeout(r, 1400));
    expect((await b.call("GET", `/v1/resident/invoices/${open!.id}`)).body).toMatchObject({
      status: "paid",
      balance: "0.00",
    });
    expect((await b.call("GET", `/v1/resident/invoices/${open!.id}/slips`)).body!.data).toContainEqual(
      expect.objectContaining({ id: good.body!.id, status: "auto_confirmed" }),
    );
    expect(
      (
        await b.call("POST", `/v1/resident/invoices/${open!.id}/slips`, {
          image: slip("1.00", "T3"),
          mimeType: "image/png",
        })
      ).body,
    ).toMatchObject({ code: "invoice.nothing_due" });
  });
});
