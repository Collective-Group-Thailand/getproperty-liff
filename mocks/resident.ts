/**
 * Stateful mocks of the contract's resident operations beyond sign-in (L1 linking and language, L3 lease,
 * e-signature, notice, deposit, usage, privacy): bodies are the contract's examples adjusted to the mock account
 * (`mocks/residence.ts`), problems are the contract's documented ones. Registered before the generic example
 * handlers, so these win.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { example, mswPath, problem } from "./contract";
import { authenticate, purposesFor, residentMe } from "./handlers";
import {
  addActiveLease,
  addPendingLease,
  bangkokDate,
  BEFORE_PHOTOS,
  earliestNoticeDate,
  giveNotice,
  MOCK_CONTRACT_SHA,
  residenceOf,
  signLease,
  SIGNATURE_OTP,
  usageSeries,
  type MockLease,
  type MockResidence,
} from "./residence";
import { UNIT_A, UNIT_B } from "./state";
import { bangkokIso } from "./tokens";
import { uploadedBy } from "./uploads";

type Schemas = components["schemas"];

/** Codes the mock understands: `OK…` links a unit, `SIGN…` a lease to sign, `USED…`/`EXPIRED…` were used. */
export const MOCK_INVITATION = {
  valid: "OK-7KQ2M9",
  lease: "SIGN-5PQ8R2",
  used: "USED-4F8P2A",
  expired: "EXPIRED-9X3L1C",
};

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** The idempotency rules of contract §3 for the operations that require a key. */
function replayOf(residence: MockResidence, request: Request, operationId: string, required: boolean) {
  const key = request.headers.get("idempotency-key");
  if (!key) return required ? { response: problem(operationId, "idempotency.key_required") } : { key: null };
  if (!/^[0-9a-f-]{36}$/i.test(key)) return { response: problem(operationId, "idempotency.key_invalid") };
  const id = `${request.method} ${new URL(request.url).pathname} ${key}`;
  const seen = residence.replays.get(id);
  if (seen) {
    return {
      response: HttpResponse.json(seen.body as Record<string, unknown>, {
        status: seen.status,
        headers: { "idempotent-replayed": "true" },
      }),
    };
  }
  return { key: id };
}

function remember(residence: MockResidence, key: string | null, status: number, body: unknown): Response {
  if (key) residence.replays.set(key, { status, body });
  return HttpResponse.json(body as Record<string, unknown>, { status });
}

function leaseOf(residence: MockResidence, id: string | readonly string[] | undefined): MockLease | undefined {
  return residence.leases.find((l) => l.dto.id === id);
}

const RULE_CLAUSES = new Set(["house_rules", "pets", "smoking", "guests", "quiet_hours", "parking_rules", "waste"]);

/**
 * The lease as the API returns it: the earliest move-out date it accepts (today + 30 days, ข้อ 4 (11) — computed by
 * the API, never by the app) and the rules acknowledgement, offered as `acknowledge-rules` while it is due.
 */
export function leaseView(lease: MockLease): Schemas["ResidentLeaseDto"] {
  const hasRules = lease.dto.addendum.some((clause) => RULE_CLAUSES.has(clause.type));
  const live = !["ended", "terminated", "cancelled"].includes(lease.dto.status);
  const nextActions = lease.dto.nextActions.filter((a) => a !== "acknowledge-rules");
  if (hasRules && live && !lease.rulesAcknowledgedAt) nextActions.push("acknowledge-rules");
  return {
    ...lease.dto,
    nextActions,
    noticeEarliestDate: lease.dto.nextActions.includes("give-notice") ? earliestNoticeDate() : null,
    rulesAcknowledgedAt: lease.rulesAcknowledgedAt,
  };
}

const PNG_MAGIC = "iVBORw0KGgo";

/** Thousandths as integers, so the mock's totals are exact like the API's (the app never adds usage up). */
function total(points: { usage: string }[]): string {
  const milli = points.reduce((sum, p) => sum + Math.round(Number(p.usage) * 1000), 0);
  return (milli / 1000).toFixed(3);
}

function usageSummary(residence: MockResidence, from: number, to: number, bucket: "15m" | "1h" | "1d") {
  if (residence.usage === "manual") return [];
  const span = to - from;
  const current = usageSeries(residence, from, to, bucket);
  const previous = usageSeries(residence, from - span, from, bucket);
  const now = Date.now();
  const cycleStart = Date.parse(`${bangkokDate(now).slice(0, 8)}01T00:00:00+07:00`);
  const cycle = usageSeries(residence, cycleStart, now, "1d");
  return current.map((series, index) => ({
    utility: series.utility,
    unit: series.unit,
    total: total(series.points),
    previousTotal: total(previous[index]!.points),
    cycleToDate: { from: bangkokIso(cycleStart), usage: total(cycle[index]!.points), estimated: true },
  }));
}

export const residentHandlers: HttpHandler[] = [
  // ── linking (D-061) and language (D-064) ────────────────────────────────────────────────────
  http.post(mswPath("/v1/resident/link"), async ({ request }) => {
    const op = "resident.link.create";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const body = await json<{ code?: unknown }>(request);
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) return problem(op, "validation.failed");
    const { account } = auth;
    if (account.consents.some((c) => c.required && !(c.granted === true && c.grantedVersion === c.version))) {
      return problem(op, "consent.required");
    }
    if (code.startsWith("USED") || code.startsWith("EXPIRED")) return problem(op, "invitation.not_pending");
    if (!code.startsWith("OK") && !code.startsWith("SIGN")) return problem(op, "invitation.not_found");
    if (account.accepted.has(code)) return problem(op, "invitation.not_pending");
    account.accepted.add(code);
    const base = example<Schemas["ResidentLinkedDto"]>(op);
    if (code.startsWith("SIGN")) {
      const lease = addPendingLease(account);
      return HttpResponse.json({ ...base, tenantId: lease.tenantId, leaseId: lease.id, units: [] });
    }
    const unit = account.units.some((u) => u.unitId === UNIT_A.unitId) ? UNIT_B : UNIT_A;
    if (!account.units.some((u) => u.unitId === unit.unitId)) account.units.push(unit);
    const lease = addActiveLease(account);
    return HttpResponse.json({ ...base, tenantId: unit.tenantId, leaseId: lease.id, units: [unit] });
  }),

  http.patch(mswPath("/v1/resident/me"), async ({ request }) => {
    const op = "resident.me.update";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const body = await json<{ language?: unknown }>(request);
    const language = body?.language;
    if (typeof language !== "string" || !["th", "en", "my", "km", "lo", "zh"].includes(language)) {
      return problem(op, "validation.failed");
    }
    auth.account.language = language as Schemas["ResidentLanguage"];
    return HttpResponse.json(residentMe(auth.account));
  }),

  // ── leases and e-signature (B2.3, D-062) ──────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/leases"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.leases.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json(residenceOf(auth.account).leases.map(leaseView));
  }),

  http.get(mswPath("/v1/resident/leases/:leaseId"), ({ request, params }) => {
    const op = "resident.leases.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const lease = leaseOf(residenceOf(auth.account), params.leaseId);
    return lease ? HttpResponse.json(leaseView(lease)) : problem(op, "http.not_found");
  }),

  http.get(mswPath("/v1/resident/leases/:leaseId/contract"), ({ request, params }) => {
    const op = "resident.leases.contract";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const lease = leaseOf(residenceOf(auth.account), params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    const base = example<Schemas["ContractDownloadDto"]>(op);
    return HttpResponse.json({
      ...base,
      number: lease.dto.number,
      sha256: MOCK_CONTRACT_SHA,
      signed: lease.dto.status !== "pending_signature",
      url: `https://storage.example.com/contracts/${lease.dto.id}.pdf?X-Goog-Signature=mock`,
      expiresAt: bangkokIso(Date.now() + 5 * 60_000),
    });
  }),

  http.post(mswPath("/v1/resident/leases/:leaseId/signature/otp"), ({ request, params }) => {
    const op = "resident.leases.requestSignatureOtp";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const lease = leaseOf(residence, params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    if (lease.dto.status !== "pending_signature") return problem(op, "lease.invalid_state");
    if (!lease.dto.signatureRequired) return problem(op, "lease.already_signed");
    const challengeId = crypto.randomUUID();
    residence.challenges.set(challengeId, { leaseId: lease.dto.id, attempts: 0 });
    const now = Date.now();
    return HttpResponse.json({
      challengeId,
      phoneMasked: "08•-•••-1234",
      expiresAt: bangkokIso(now + 5 * 60_000),
      resendAvailableAt: bangkokIso(now + 60_000),
    } satisfies Schemas["ResidentSignatureOtpDto"]);
  }),

  http.post(mswPath("/v1/resident/leases/:leaseId/sign"), async ({ request, params }) => {
    const op = "resident.leases.sign";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const replay = replayOf(residence, request, op, true);
    if (replay.response) return replay.response;
    const lease = leaseOf(residence, params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    const body = await json<Partial<Schemas["ResidentSignDto"]>>(request);
    if (!body || typeof body.challengeId !== "string" || typeof body.code !== "string") {
      return problem(op, "validation.failed");
    }
    if (lease.dto.status !== "pending_signature") return problem(op, "lease.invalid_state");
    if (!lease.dto.signatureRequired) return problem(op, "lease.already_signed");
    if (body.contractSha256?.toLowerCase() !== MOCK_CONTRACT_SHA) return problem(op, "lease.contract_changed");
    const png = typeof body.signaturePng === "string" ? body.signaturePng : "";
    if (!png.startsWith(PNG_MAGIC) || png.length > Math.ceil((200 * 1024 * 4) / 3)) {
      return problem(op, "lease.signature_invalid");
    }
    const challenge = residence.challenges.get(body.challengeId);
    // The API verifies the OTP with the shared OTP service; its problems are documented on the sign-in verify.
    if (!challenge || challenge.leaseId !== lease.dto.id) return problem("auth.residentOtp.verify", "auth.otp_expired");
    if (body.code !== SIGNATURE_OTP) {
      challenge.attempts += 1;
      return problem("auth.residentOtp.verify", "auth.otp_invalid", { attemptsRemaining: 5 - challenge.attempts });
    }
    residence.challenges.delete(body.challengeId);
    signLease(lease);
    return remember(residence, replay.key, 200, leaseView(lease));
  }),

  http.post(mswPath("/v1/resident/leases/:leaseId/notice"), async ({ request, params }) => {
    const op = "resident.leases.giveNotice";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const lease = leaseOf(residence, params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    const body = await json<{ effectiveDate?: unknown }>(request);
    const date = typeof body?.effectiveDate === "string" ? body.effectiveDate : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return problem(op, "validation.failed");
    if (lease.dto.status !== "active") return problem(op, "lease.invalid_state");
    if (date < earliestNoticeDate()) return problem(op, "compliance.notice_period");
    giveNotice(lease, date, residence);
    return HttpResponse.json(leaseView(lease));
  }),

  http.get(mswPath("/v1/resident/leases/:leaseId/usage"), ({ request, params }) => {
    const op = "resident.usage.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const lease = leaseOf(residence, params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    const url = new URL(request.url);
    const bucket = (url.searchParams.get("bucket") ?? "1d") as "15m" | "1h" | "1d";
    if (!["15m", "1h", "1d"].includes(bucket)) return problem(op, "validation.failed");
    const to = url.searchParams.get("to") ? Date.parse(url.searchParams.get("to")!) : Date.now();
    const from = url.searchParams.get("from") ? Date.parse(url.searchParams.get("from")!) : to - 30 * 86_400_000;
    if (Number.isNaN(from) || Number.isNaN(to) || from >= to) return problem(op, "validation.failed");
    return HttpResponse.json({
      leaseId: lease.dto.id,
      unitId: UNIT_A.unitId,
      bucket,
      from: bangkokIso(from),
      to: bangkokIso(to),
      series: usageSeries(residence, from, to, bucket),
      summary: usageSummary(residence, from, to, bucket),
    });
  }),

  // ── deposits (B2.4, D-023) ──────────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/deposits"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.deposits.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json(residenceOf(auth.account).deposits.map(depositView));
  }),

  http.get(mswPath("/v1/resident/deposits/:depositId"), ({ request, params }) => {
    const op = "resident.deposits.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const deposit = residenceOf(auth.account).deposits.find((d) => d.id === params.depositId);
    return deposit ? HttpResponse.json(depositView(deposit)) : problem(op, "http.not_found");
  }),

  http.post(mswPath("/v1/resident/deposits/:depositId/actions/accept"), ({ request, params }) => {
    const op = "resident.deposits.accept";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const replay = replayOf(residence, request, op, false);
    if (replay.response) return replay.response;
    const deposit = residence.deposits.find((d) => d.id === params.depositId);
    if (!deposit) return problem(op, "http.not_found");
    if (!deposit.settlement || deposit.settlement.status !== "proposed") return problem(op, "deposit.invalid_state");
    deposit.settlement = {
      ...deposit.settlement,
      status: "agreed",
      residentResponse: "accepted",
      agreedRefund: deposit.settlement.proposedRefund,
    };
    deposit.nextActions = [];
    return remember(residence, replay.key, 200, depositView(deposit));
  }),

  http.post(mswPath("/v1/resident/deposits/:depositId/actions/dispute"), async ({ request, params }) => {
    const op = "resident.deposits.dispute";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const replay = replayOf(residence, request, op, false);
    if (replay.response) return replay.response;
    const deposit = residence.deposits.find((d) => d.id === params.depositId);
    if (!deposit) return problem(op, "http.not_found");
    const body = await json<{ reason?: unknown; photoDocumentIds?: unknown }>(request);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3) return problem(op, "validation.failed");
    // Photos uploaded with POST /v1/resident/uploads for this deposit, by me.
    const photos = Array.isArray(body?.photoDocumentIds) ? body.photoDocumentIds.map(String) : [];
    if (photos.length > 6 || !uploadedBy(auth.account.userId, photos, "deposit_dispute", deposit.id)) {
      return problem(op, "validation.failed");
    }
    if (!deposit.settlement || deposit.settlement.status !== "proposed") return problem(op, "deposit.invalid_state");
    deposit.status = "disputed";
    deposit.settlement = {
      ...deposit.settlement,
      status: "disputed",
      residentResponse: "disputed",
      disputeReason: reason,
    };
    deposit.nextActions = [];
    (deposit as Record<string, unknown>).disputePhotoCount = photos.length;
    return remember(residence, replay.key, 200, depositView(deposit));
  }),

  // ── privacy (B1.3, D-025) ───────────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/me/privacy"), ({ request }) => {
    const op = "resident.privacy.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const base = example<Schemas["ResidentPrivacyDto"]>(op);
    const language = (request.headers.get("accept-language") ?? "th").startsWith("en") ? "en" : "th";
    const consents = purposesFor(auth.account, language);
    return HttpResponse.json({
      ...base,
      consentComplete: consents.every((c) => !c.required || c.granted === true),
      consents,
      controllers: base.controllers.map((c) => ({
        ...c,
        tenantId: UNIT_A.tenantId,
        tenantName: UNIT_A.tenantName,
        parties: c.parties.map((p) => ({ ...p, displayName: auth.account.displayName })),
      })),
      requests: residenceOf(auth.account).dsrs,
      user: { id: auth.account.userId, displayName: auth.account.displayName },
    });
  }),

  http.get(mswPath("/v1/resident/data-subject-requests"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.dataSubjectRequests.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json(residenceOf(auth.account).dsrs);
  }),

  http.post(mswPath("/v1/resident/data-subject-requests"), async ({ request }) => {
    const op = "resident.dataSubjectRequests.create";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const replay = replayOf(residence, request, op, true);
    if (replay.response) return replay.response;
    const body = await json<Partial<Schemas["DsrCreateDto"]>>(request);
    const kinds = ["access", "rectification", "erasure", "portability", "objection", "restriction"];
    if (!body || typeof body.kind !== "string" || !kinds.includes(body.kind)) return problem(op, "validation.failed");
    if (typeof body.details === "string" && body.details.length > 2000) return problem(op, "validation.failed");
    const now = Date.now();
    const created: Schemas["DsrDto"] = {
      ...example<Schemas["DsrDto"][]>(op)[0]!,
      id: crypto.randomUUID(),
      kind: body.kind,
      state: "received",
      receivedAt: bangkokIso(now),
      dueAt: bangkokIso(now + 30 * 86_400_000),
      fulfilledAt: null,
      exportDocumentId: null,
      notes: null,
      nextActions: [],
      tenantId: UNIT_A.tenantId,
    };
    residence.dsrs.unshift(created);
    return remember(residence, replay.key, 201, [created]);
  }),

  http.post(mswPath("/v1/resident/push-subscriptions"), ({ request }) => {
    const op = "resident.pushSubscriptions.create";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    return HttpResponse.json(
      { id: crypto.randomUUID(), createdAt: bangkokIso(Date.now()) } satisfies Schemas["PushSubscriptionDto"],
      { status: 201 },
    );
  }),

  // ── lease rules acknowledgement, notification preferences, documents on file (A6, D-203) ──────────
  http.post(mswPath("/v1/resident/leases/:leaseId/rules/acknowledge"), ({ request, params }) => {
    const op = "resident.leases.acknowledgeRules";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const lease = residenceOf(auth.account).leases.find((l) => l.dto.id === params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    const live = !["ended", "terminated", "cancelled"].includes(lease.dto.status);
    const hasRules = lease.dto.addendum.some((clause) => RULE_CLAUSES.has(clause.type));
    if (!live || !hasRules) return problem(op, "lease.invalid_state");
    lease.rulesAcknowledgedAt ??= bangkokIso(Date.now());
    return HttpResponse.json(leaseView(lease));
  }),

  http.get(mswPath("/v1/resident/me/notification-preferences"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.notificationPreferences.get");
    if (auth instanceof Response) return auth;
    return HttpResponse.json({ items: residenceOf(auth.account).preferences });
  }),

  http.put(mswPath("/v1/resident/me/notification-preferences"), async ({ request }) => {
    const op = "resident.notificationPreferences.update";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const body = await json<{ items?: { topic?: unknown; line?: unknown; sms?: unknown }[] }>(request);
    if (!body || !Array.isArray(body.items)) return problem(op, "validation.failed");
    for (const item of body.items) {
      const current = residence.preferences.find((p) => p.topic === item.topic);
      if (!current || typeof item.line !== "boolean" || typeof item.sms !== "boolean") {
        return problem(op, "validation.failed");
      }
      if (current.locked && (!item.line || !item.sms)) return problem(op, "validation.failed");
    }
    for (const item of body.items) {
      const current = residence.preferences.find((p) => p.topic === item.topic)!;
      current.line = item.line as boolean;
      current.sms = item.sms as boolean;
    }
    return HttpResponse.json({ items: residence.preferences });
  }),

  http.get(mswPath("/v1/resident/documents"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.documents.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json(residenceOf(auth.account).documents);
  }),

  http.get(mswPath("/v1/resident/documents/:documentId/download"), ({ request, params }) => {
    const op = "resident.documents.download";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const document = residenceOf(auth.account).documents.find((d) => d.id === params.documentId);
    if (!document) return problem(op, "http.not_found");
    return HttpResponse.json({
      id: document.id,
      title: document.title,
      url: `https://storage.example.com/documents/${document.id}.pdf?X-Goog-Signature=mock`,
      expiresAt: bangkokIso(Date.now() + 5 * 60_000),
    });
  }),
];

/** The deposit as the contract publishes it, with the move-in photos of each deducted item. */
export function depositView(deposit: Schemas["ResidentDepositDto"]) {
  return {
    ...deposit,
    deductions: deposit.deductions.map((d) => ({
      ...d,
      beforeEvidenceUrls: BEFORE_PHOTOS.get(d.id) ?? [],
    })),
  };
}
