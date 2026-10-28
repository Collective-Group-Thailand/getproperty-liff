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
    // D-226: the verified phone matches a party, which waits for the Owner — nothing is linked yet.
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({
      user: { phone: "+66810001234", lineLinked: false },
      units: [],
      leaseIds: [],
      entitlements: [],
      linkRequestsPending: 1,
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
      depositId: deposit!.id,
      contentType: "image/jpeg",
      sizeBytes: 3,
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
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

  it("match the GL3 contract, offer and lease ids (lighthouse/resident-contracts.json)", async () => {
    const { readFileSync } = await import("node:fs");
    const { mockLeaseId } = await import("./residence");
    const urls = (
      JSON.parse(readFileSync(new URL("../lighthouse/resident-contracts.json", import.meta.url), "utf8")) as {
        ci: { collect: { url: string[] } };
      }
    ).ci.collect.url;
    const lease = mockLeaseId("line:Ulighthouse-contracts-renewal", 0);
    expect(urls).toContain(`http://localhost:3400/contracts/${lease.slice(0, -4)}c1a1/sign`);
    expect(urls).toContain(`http://localhost:3400/renewals/${lease.slice(0, -4)}e0f1`);
    expect(urls).toContain(`http://localhost:3400/lease/${lease}`);
  });

  it("match the seeded request, facility and work-order ids (lighthouse/resident-r2.json, technician.json)", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (set: string) =>
      (
        JSON.parse(readFileSync(new URL(`../lighthouse/${set}.json`, import.meta.url), "utf8")) as {
          ci: { collect: { url: string[] } };
        }
      ).ci.collect.url;
    const { mockSeedId } = await import("./service");
    const { FACILITIES } = await import("./community");
    expect(read("resident-r2")).toContain(
      `http://localhost:3400/requests/${mockSeedId("line:Ulighthouse-resident", "request", "open")}`,
    );
    expect(read("resident-r2")).toContain(`http://localhost:3400/facilities/${FACILITIES[0]!.id}`);
    expect(read("technician")).toContain(
      `http://localhost:3400/technician/work-orders/${mockSeedId("line:Ulighthouse-tech", "work-order", "leak")}`,
    );
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

describe("contract requests #22–#28 as the API ships them (D-218)", () => {
  type Dto = Record<string, unknown> & { id: string; nextActions: string[] };
  const KEY = () => crypto.randomUUID();

  async function openRequest(b: ReturnType<typeof browser>): Promise<Dto> {
    const list = await b.call("GET", "/v1/resident/service-requests");
    const items = (list.body as { data: Dto[] }).data;
    return items.find((r) => r.status === "assigned")!;
  }

  it("#22/#24: every request answer carries photos, history, SLA, preferred visit and the visit confirmation", async () => {
    const b = browser();
    await b.signIn("Umock-d218-request-1");
    const open = await openRequest(b);
    expect(open).toMatchObject({ preferredVisit: "afternoon", visitConfirmedAt: null, sla: { state: "on_track" } });
    expect((open.events as { status: string }[]).map((e) => e.status)).toEqual(["new", "triaged", "assigned"]);
    expect(open.nextActions).toContain("confirm-visit");

    const confirmed = await b.call("POST", `/v1/resident/service-requests/${open.id}/actions/confirm-visit`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ visitConfirmedAt: expect.any(String) });
    expect((confirmed.body as Dto).nextActions).not.toContain("confirm-visit");
    expect((await b.call("POST", `/v1/resident/service-requests/${open.id}/actions/confirm-visit`)).body).toMatchObject(
      { code: "service_request.invalid_state" },
    );

    // The office moves the visit: the confirmation no longer counts and is asked again.
    const moved = await b.call("POST", `/v1/resident/__mock/service-requests/${open.id}/reschedule`, { hours: 24 });
    expect(moved.body).toMatchObject({ visitConfirmedAt: null });
    expect((moved.body as Dto).visitAt).not.toBe(open.visitAt);
    expect((moved.body as Dto).nextActions).toContain("confirm-visit");
  });

  it("#24: takes preferredVisit on create (and refuses a value outside VisitPreference)", async () => {
    const b = browser();
    await b.signIn("Umock-d218-create-2");
    const me = (await b.call("GET", "/v1/resident/me")).body as { units: { unitId: string }[] };
    const unitId = me.units[0]!.unitId;
    const categories = (await b.call("GET", `/v1/resident/service-categories?unitId=${unitId}`)).body as {
      data: { id: string }[];
    };
    const body = {
      unitId,
      categoryId: categories.data[0]!.id,
      description: "ไฟห้องน้ำไม่ติด",
      preferredVisit: "evening",
    };
    const created = await b.call("POST", "/v1/resident/service-requests", body, { "idempotency-key": KEY() });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ preferredVisit: "evening", description: "ไฟห้องน้ำไม่ติด", sla: {} });
    const refused = await b.call("POST", "/v1/resident/service-requests", { ...body, preferredVisit: "night" });
    expect(refused.body).toMatchObject({ code: "validation.failed" });
  });

  it("#23: one thread shared by the resident and the technician, replayed per Idempotency-Key", async () => {
    const resident = browser();
    await resident.signIn("Umock-d218-thread-3");
    const open = await openRequest(resident);
    const path = `/v1/resident/service-requests/${open.id}/messages`;
    const key = KEY();
    const posted = await resident.call("POST", path, { body: "สะดวกช่วงบ่ายค่ะ" }, { "idempotency-key": key });
    expect(posted.status).toBe(201);
    expect(posted.body).toMatchObject({ author: "resident", body: "สะดวกช่วงบ่ายค่ะ", mine: true });
    const again = await resident.call("POST", path, { body: "สะดวกช่วงบ่ายค่ะ" }, { "idempotency-key": key });
    expect((again.body as Dto).id).toBe((posted.body as Dto).id);
    expect((await resident.call("POST", path, { body: "x".repeat(2001) })).body).toMatchObject({
      code: "validation.failed",
    });
    const thread = (await resident.call("GET", path)).body as { data: { author: string; mine: boolean }[] };
    expect(thread.data.map((m) => [m.author, m.mine])).toEqual([
      ["office", false],
      ["resident", true],
    ]);

    // The office assigns a technician (mock control), who writes on the same thread.
    const assigned = await resident.call("POST", `/v1/resident/__mock/service-requests/${open.id}/assign`, {
      technician: "Umock-d218-tech-3",
    });
    const workOrderId = (assigned.body as { workOrderId: string }).workOrderId;
    const tech = browser(true);
    await tech.call("POST", "/auth/technician/line", {
      idToken: fakeLineIdToken({ sub: "Umock-d218-tech-3", name: "ช่าง" }),
    });
    const reply = await tech.call("POST", `/v1/technician/work-orders/${workOrderId}/messages`, {
      body: "พรุ่งนี้ 10 โมง",
    });
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({ author: "technician", mine: true });
    const seen = (await resident.call("GET", path)).body as { data: { author: string }[] };
    expect(seen.data.at(-1)).toMatchObject({ author: "technician", mine: false, body: "พรุ่งนี้ 10 โมง" });
  });

  it("#25: the technician's work order carries photo links, the preferred visit and the rating", async () => {
    const tech = browser(true);
    await tech.call("POST", "/auth/technician/line", { idToken: fakeLineIdToken({ sub: "Umock-tech-d218-4" }) });
    const list = (await tech.call("GET", "/v1/technician/work-orders")).body as { data: Dto[] };
    const leak = list.data[0]!;
    const detail = (await tech.call("GET", `/v1/technician/work-orders/${leak.id}`)).body as Dto & {
      photos: { role: string; url: string | null }[];
    };
    expect(detail.photos).toEqual([{ id: expect.any(String), role: "report", url: expect.any(String) }]);
    expect(detail).toMatchObject({ rating: null, ratingComment: null, preferredVisit: null });
  });

  it("#26: visitor codes within the operator's policy, Idempotency-Key required", async () => {
    const b = browser();
    await b.signIn("Umock-d218-visitor-5");
    const creds = (await b.call("GET", "/v1/resident/access/credentials")).body as { visitorPolicy: object };
    expect(creds.visitorPolicy).toEqual({ allowed: true, maxHours: 12 });
    const me = (await b.call("GET", "/v1/resident/me")).body as { units: { unitId: string }[] };
    const now = Date.now();
    const body = {
      unitId: me.units[0]!.unitId,
      visitorName: "คุณแม่",
      validFrom: new Date(now).toISOString(),
      validTo: new Date(now + 4 * 3_600_000).toISOString(),
    };
    expect((await b.call("POST", "/v1/resident/access/visitor-codes", body)).body).toMatchObject({
      code: "idempotency.key_required",
    });
    const key = KEY();
    const created = await b.call("POST", "/v1/resident/access/visitor-codes", body, { "idempotency-key": key });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      holderKind: "visitor",
      holderName: "คุณแม่",
      pin: expect.stringMatching(/^\d{6}$/),
    });
    const replay = await b.call("POST", "/v1/resident/access/visitor-codes", body, { "idempotency-key": key });
    expect((replay.body as Dto).pin).toBe((created.body as Dto).pin);
    const tooLong = { ...body, validTo: new Date(now + 13 * 3_600_000).toISOString() };
    expect(
      (await b.call("POST", "/v1/resident/access/visitor-codes", tooLong, { "idempotency-key": KEY() })).body,
    ).toMatchObject({ code: "validation.failed" });

    const off = browser();
    await off.signIn("Umock-d218-novisitor-6");
    expect(
      ((await off.call("GET", "/v1/resident/access/credentials")).body as { visitorPolicy: object }).visitorPolicy,
    ).toEqual({ allowed: false, maxHours: 0 });
    const offMe = (await off.call("GET", "/v1/resident/me")).body as { units: { unitId: string }[] };
    const refused = await off.call(
      "POST",
      "/v1/resident/access/visitor-codes",
      { ...body, unitId: offMe.units[0]!.unitId },
      { "idempotency-key": KEY() },
    );
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: "access.visitor_codes_disabled" });
  });

  it("#27: facilities and access entitlements (access only with a lock on my unit)", async () => {
    const b = browser();
    await b.signIn("Umock-d218-entitled-7");
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({
      entitlements: expect.arrayContaining(["facilities", "access"]),
    });
    const noLocks = browser();
    await noLocks.signIn("Umock-d218-nolocks-8");
    const me = (await noLocks.call("GET", "/v1/resident/me")).body as { entitlements: string[] };
    expect(me.entitlements).toContain("facilities");
    expect(me.entitlements).not.toContain("access");
    const noCommunity = browser();
    await noCommunity.signIn("Umock-d218-nocommunity-9");
    const bare = (await noCommunity.call("GET", "/v1/resident/me")).body as { entitlements: string[] };
    expect(bare.entitlements).not.toContain("facilities");
  });
});

describe("api 048a8bd release fixes (F7, D-219–D-227)", () => {
  async function smsSignIn(b: ReturnType<typeof browser>, phone: string, audience: "resident" | "technician") {
    const challenge = await b.call("POST", `/v1/auth/${audience}/otp/request`, { phone });
    const challengeId = challenge.body!.challengeId as string;
    expect((await b.call("POST", `/v1/auth/${audience}/otp/verify`, { challengeId, code: OTP_CODE })).status).toBe(200);
  }

  it("D-226: a phone match links nothing until the Owner confirms; the token gains the scopes on refresh", async () => {
    const b = browser();
    await smsSignIn(b, "0810002468", "resident");
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({ units: [], linkRequestsPending: 1 });
    expect((await b.call("GET", "/v1/resident/invoices")).body).toMatchObject({ data: [] });

    const confirmed = await b.call("POST", "/v1/resident/__mock/link-requests/confirm");
    expect(confirmed.status).toBe(200);
    const me = (await b.call("GET", "/v1/resident/me")).body as {
      units: { unitId: string }[];
      leaseIds: string[];
      scopes: string[];
      linkRequestsPending: number;
    };
    expect(me.linkRequestsPending).toBe(0);
    expect(me.units).toHaveLength(1);
    expect(me.leaseIds).toHaveLength(1);
    // `/me` reads the links; the token issued before the confirmation does not carry them yet.
    expect(me.scopes).toEqual([]);
    expect((await b.call("POST", "/auth/refresh")).status).toBe(200);
    const after = (await b.call("GET", "/v1/resident/me")).body as { scopes: string[] };
    expect(after.scopes).toEqual(expect.arrayContaining([`unit:${me.units[0]!.unitId}`, `lease:${me.leaseIds[0]!}`]));
    expect(((await b.call("GET", "/v1/resident/invoices")).body!.data as unknown[]).length).toBeGreaterThan(0);

    // A phone no office entered: nothing waits.
    const stranger = browser();
    await smsSignIn(stranger, "0810000000", "resident");
    expect((await stranger.call("GET", "/v1/resident/me")).body).toMatchObject({ units: [], linkRequestsPending: 0 });
  });

  it("D-226: a technician's phone match shows no work order until the Owner confirms", async () => {
    const b = browser(true);
    await smsSignIn(b, "0812223344", "technician");
    expect((await b.call("GET", "/v1/technician/me")).body).toMatchObject({ workOrderIds: [] });
    expect((await b.call("GET", "/v1/technician/work-orders")).body).toMatchObject({ data: [] });
    expect((await b.call("POST", "/v1/technician/__mock/link-requests/confirm")).status).toBe(204);
    expect(((await b.call("GET", "/v1/technician/me")).body!.workOrderIds as string[]).length).toBe(2);
  });

  it("D-224: a former occupant's request, parcel and booking are never the new resident's", async () => {
    const b = browser();
    await b.signIn("Umock-d224-occupant-1");
    const { mockSeedId } = await import("./service");
    const former = mockSeedId("line:Umock-d224-occupant-1", "request", "former");
    const requests = (await b.call("GET", "/v1/resident/service-requests")).body!.data as { id: string }[];
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.map((r) => r.id)).not.toContain(former);
    expect((await b.call("GET", `/v1/resident/service-requests/${former}`)).status).toBe(404);
    expect((await b.call("GET", `/v1/resident/service-requests/${former}/messages`)).status).toBe(404);
    const parcels = (await b.call("GET", "/v1/resident/parcels")).body!.data as { trackingNo: string | null }[];
    expect(parcels).toHaveLength(2);
    expect(parcels.map((p) => p.trackingNo)).not.toContain("TH0000FORMER");
    const bookings = (await b.call("GET", "/v1/resident/facility-bookings")).body!.data as { note: string | null }[];
    expect(bookings.map((x) => x.note)).not.toContain("ประชุมผู้เช่าคนก่อน");
  });

  it("D-220: a held QR payment leaves the bill as it was; a slip like a booked QR payment waits for the office", async () => {
    const b = browser();
    await b.signIn("Umock-d220-held-1");
    const [open] = (await b.call("GET", "/v1/resident/invoices?unpaid=true")).body!.data as {
      id: string;
      balance: string;
      status: string;
    }[];
    const held = await b.call("POST", `/v1/resident/__mock/invoices/${open!.id}/pay`, { held: true });
    expect(held.body).toMatchObject({ status: open!.status, balance: open!.balance });

    const part = await b.call("POST", `/v1/resident/__mock/invoices/${open!.id}/pay`, { amount: "1000.00" });
    expect(part.body).toMatchObject({ status: "partially_paid" });
    const slip = Buffer.concat([
      Buffer.from("89504e47", "hex"),
      Buffer.from(JSON.stringify({ transRef: "T-QRDUP", amount: "1000.00", receiverAccount: "xxx1234" })),
    ]).toString("base64");
    const sent = await b.call("POST", `/v1/resident/invoices/${open!.id}/slips`, {
      image: slip,
      mimeType: "image/png",
    });
    expect(sent.status).toBe(201);
    await new Promise((r) => setTimeout(r, 1400));
    const slips = (await b.call("GET", `/v1/resident/invoices/${open!.id}/slips`)).body!.data as {
      status: string;
      reasons: string[];
    }[];
    expect(slips[0]).toMatchObject({ status: "pending_review" });
    expect(slips[0]!.reasons).toContain("possible_qr_duplicate");
  });
});

describe("api 0428349 — LIFF #29–#31 (F8, D-228)", () => {
  async function smsSignIn(b: ReturnType<typeof browser>, phone: string, audience: "resident" | "technician") {
    const challenge = await b.call("POST", `/v1/auth/${audience}/otp/request`, { phone });
    const challengeId = challenge.body!.challengeId as string;
    expect((await b.call("POST", `/v1/auth/${audience}/otp/verify`, { challengeId, code: OTP_CODE })).status).toBe(200);
  }

  async function heard(userId: string, run: () => Promise<unknown>): Promise<string[]> {
    const { subscribeEvents } = await import("./events");
    const types: string[] = [];
    const off = subscribeEvents(userId, (type) => types.push(type));
    try {
      await run();
    } finally {
      off();
    }
    return types;
  }

  it("#29: the technician's /me counts the phone match still waiting for the Owner", async () => {
    const b = browser(true);
    await smsSignIn(b, "0812225566", "technician");
    expect((await b.call("GET", "/v1/technician/me")).body).toMatchObject({ workOrderIds: [], linkRequestsPending: 1 });
    expect((await b.call("POST", "/v1/technician/__mock/link-requests/confirm")).status).toBe(204);
    expect((await b.call("GET", "/v1/technician/me")).body).toMatchObject({ linkRequestsPending: 0 });
  });

  it("#30: a held transfer is counted on the pay sheet (no amount, no reason) until the office decides", async () => {
    const b = browser();
    await b.signIn("Umock-d228-held-1");
    const me = (await b.call("GET", "/v1/resident/me")).body as { user: { id: string } };
    const [open] = (await b.call("GET", "/v1/resident/invoices?unpaid=true")).body!.data as { id: string }[];
    const payment = `/v1/resident/invoices/${open!.id}/payment`;
    expect((await b.call("GET", payment)).body).toMatchObject({ checking: null });

    const events = await heard(me.user.id, async () => {
      await b.call("POST", `/v1/resident/__mock/invoices/${open!.id}/pay`, { held: true });
      await b.call("POST", `/v1/resident/__mock/invoices/${open!.id}/pay`, { held: true });
    });
    expect(events).toEqual(["payment.held", "payment.held"]);
    const checking = (await b.call("GET", payment)).body!.checking as Record<string, unknown>;
    expect(checking).toEqual({ count: 2, since: expect.stringMatching(/\+07:00$/) });

    expect(
      await heard(me.user.id, () =>
        b.call("POST", `/v1/resident/__mock/invoices/${open!.id}/held`, { decision: "dismiss" }),
      ),
    ).toEqual(["payment.dismissed", "payment.dismissed"]);
    expect((await b.call("GET", payment)).body).toMatchObject({ checking: null });
    expect(
      (await b.call("POST", `/v1/resident/__mock/invoices/${open!.id}/held`, { decision: "dismiss" })).status,
    ).toBe(422);

    // A held transfer the office books as a second payment: the bill is paid.
    await b.call("POST", `/v1/resident/__mock/invoices/${open!.id}/pay`, { held: true });
    const booked = await b.call("POST", `/v1/resident/__mock/invoices/${open!.id}/held`, { decision: "confirm" });
    expect(booked.body).toMatchObject({ status: "paid" });
  });

  it("#31: the Owner's decision is heard as party.link_changed; a rejection leaves nothing pending and no unit", async () => {
    const b = browser();
    await smsSignIn(b, "0810003579", "resident");
    const me = (await b.call("GET", "/v1/resident/me")).body as { user: { id: string }; linkRequestsPending: number };
    expect(me.linkRequestsPending).toBe(1);
    const events = await heard(me.user.id, () => b.call("POST", "/v1/resident/__mock/link-requests/reject"));
    expect(events).toEqual(["party.link_changed"]);
    expect((await b.call("GET", "/v1/resident/me")).body).toMatchObject({ units: [], linkRequestsPending: 0 });

    const other = browser();
    await smsSignIn(other, "0810009753", "resident");
    const otherMe = (await other.call("GET", "/v1/resident/me")).body as { user: { id: string } };
    expect(await heard(otherMe.user.id, () => other.call("POST", "/v1/resident/__mock/link-requests/confirm"))).toEqual(
      ["party.link_changed"],
    );
  });
});

describe("contract library documents and renewal offers (GL3, D-294)", () => {
  const PNG = "iVBORw0KGgo" + "A".repeat(100);

  it("lists the addendum to sign, signs it with the OTP and the PDF hash, and refuses a changed document", async () => {
    const b = browser();
    await b.signIn("Umock-contracts-gl3a");
    const list = await b.call("GET", "/v1/resident/contracts");
    const contracts = (list.body as { data: { id: string; kind: string; state: string; nextActions: string[] }[] })
      .data;
    const addendum = contracts.find((c) => c.kind === "addendum")!;
    expect(addendum).toMatchObject({ state: "pending_signature", nextActions: ["sign", "download"] });
    expect(contracts.find((c) => c.kind === "reservation")).toMatchObject({ state: "signed" });
    const path = `/v1/resident/contracts/${addendum.id}`;
    const document = (await b.call("GET", `${path}/document`)).body as { sha256: string };
    const otp = (await b.call("POST", `${path}/signature/otp`, { language: "th" })).body as { challengeId: string };
    const sign = (sha: string, key: string) =>
      b.call(
        "POST",
        `${path}/sign`,
        { challengeId: otp.challengeId, code: SIGNATURE_OTP, contractSha256: sha, signaturePng: PNG },
        { "idempotency-key": key },
      );
    expect((await sign("0".repeat(64), crypto.randomUUID())).body).toMatchObject({ code: "contract.changed" });
    const signed = await sign(document.sha256, crypto.randomUUID());
    expect(signed.status).toBe(200);
    expect(signed.body).toMatchObject({ state: "signed", nextActions: ["download"] });
  });

  it("accepts an offer into a renewal lease to sign; declining records the notice to the end date", async () => {
    const accepting = browser();
    await accepting.signIn("Umock-renewal-gl3b");
    const [offer] = ((await accepting.call("GET", "/v1/resident/renewal-offers")).body as { data: { id: string }[] })
      .data;
    const accepted = await accepting.call(
      "POST",
      `/v1/resident/renewal-offers/${offer!.id}/actions/accept`,
      undefined,
      {
        "idempotency-key": crypto.randomUUID(),
      },
    );
    expect(accepted.body).toMatchObject({ state: "accepted" });
    const lease = await accepting.call("GET", `/v1/resident/leases/${String(accepted.body!.newLeaseId)}`);
    expect(lease.body).toMatchObject({ status: "pending_signature", rent: "15500.00" });

    const declining = browser();
    await declining.signIn("Umock-renewal-gl3c");
    const [open] = (
      (await declining.call("GET", "/v1/resident/renewal-offers")).body as {
        data: { id: string; leaseId: string }[];
      }
    ).data;
    const declined = await declining.call(
      "POST",
      `/v1/resident/renewal-offers/${open!.id}/actions/decline`,
      { reason: "ย้ายงาน" },
      { "idempotency-key": crypto.randomUUID() },
    );
    expect(declined.body).toMatchObject({ state: "declined", declineReason: "ย้ายงาน" });
    const after = (await declining.call("GET", `/v1/resident/leases/${open!.leaseId}`)).body as {
      status: string;
      endDate: string;
      notice: { effectiveDate: string };
    };
    expect(after.status).toBe("notice_given");
    expect(after.notice.effectiveDate).toBe(after.endDate);
  });
});
