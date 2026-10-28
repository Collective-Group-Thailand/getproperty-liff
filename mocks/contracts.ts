/**
 * Signable documents of the contract library and renewal offers for residents (GL3, api G3, D-294). Opt-in by the
 * scenario words of the LINE subject, so other screens keep their data:
 *
 * - `…contracts…`: an addendum on my lease waiting for my signature (the lessor signed first) and a reservation I
 *   signed earlier — both `pending_legal_verification` with the library disclaimer, as the API returns them;
 * - `…renewal…`: an open offer to renew my lease in force, linked to the B7.5 `renewal_offer` letter. Accepting
 *   drafts a renewal lease sent for signature at once (`newLeaseId`); declining with ≥ 30 days left records my
 *   notice to the end date (D-219), with fewer the lease simply ends.
 *
 * Documented problems are forced with the `gp_mock` cookie (`resident.renewals.accept=compliance.acknowledgement_required`).
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { example, mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { addPendingLease, bangkokDate, giveNotice, residenceOf, SIGNATURE_OTP, type MockResidence } from "./residence";
import type { MockAccount } from "./state";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];
type Contract = Schemas["ContractDto"];
type Offer = Schemas["RenewalOfferDto"];

/** The sha256 of the mock contract PDFs — what the resident sends back when signing. */
export const MOCK_DOCUMENT_SHA = "5d1e8a3f0b2c4d6e8f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6a";

interface MockContracts {
  contracts: Contract[];
  offers: Offer[];
  challenges: Map<string, { contractId: string; attempts: number }>;
  replays: Map<string, { status: number; body: unknown }>;
}

const holder = globalThis as typeof globalThis & { __gpMockContracts?: Map<string, MockContracts> };
holder.__gpMockContracts ??= new Map();
const byUser = holder.__gpMockContracts;

const DAY = 86_400_000;
const PNG_MAGIC = "iVBORw0KGgo";

/** Ids derived from the lease id, so the same scenario always reads the same ids. */
const derived = (leaseId: string, suffix: string) => `${leaseId.slice(0, -4)}${suffix}`;

function addendum(residence: MockResidence, leaseId: string, unitId: string): Contract {
  const base = example<Contract>("resident.contracts.get");
  const lessee = residence.leases[0]!.dto.parties.find((p) => p.role === "lessee");
  return {
    ...base,
    id: derived(leaseId, "c1a1"),
    kind: "addendum",
    title: "บันทึกต่อท้ายสัญญาเช่า — ที่จอดรถเพิ่ม",
    number: "CTR-2569-00011",
    templateKey: "library_addendum",
    leaseId,
    unitId,
    state: "pending_signature",
    sha256: MOCK_DOCUMENT_SHA,
    sentAt: bangkokIso(Date.now() - DAY),
    signedAt: null,
    nextActions: ["sign", "download"],
    variables: {
      effectiveDate: bangkokDate(Date.now() + 3 * DAY),
      clauses: [
        { title: "ที่จอดรถคันที่สอง", text: "ผู้เช่าได้รับสิทธิ์ที่จอดรถเพิ่ม 1 คัน ช่อง B-12 ค่าบริการตามใบแจ้งหนี้" },
        { title: "การใช้ที่จอดรถ", text: "ห้ามจอดขวางทางเข้าออก และไม่ใช้ที่จอดรถเก็บสิ่งของ" },
      ],
    },
    signers: [
      {
        index: 0,
        name: "บริษัท สุขใจ เรสซิเดนซ์ จำกัด",
        partyId: null,
        role: "lessor",
        signedAt: bangkokIso(Date.now() - DAY),
        tenantId: base.signers[0]!.tenantId,
      },
      {
        index: 1,
        name: lessee?.displayName ?? "สมศรี ใจดี",
        partyId: lessee?.partyId ?? base.signers[1]!.partyId,
        role: "lessee",
        signedAt: null,
        tenantId: null,
      },
    ],
  };
}

function reservation(leaseId: string, unitId: string): Contract {
  const base = example<Contract>("resident.contracts.get");
  const signed = bangkokIso(Date.now() - 40 * DAY);
  return {
    ...base,
    id: derived(leaseId, "c1b1"),
    title: "สัญญาจองห้องเช่า A-101",
    number: "CTR-2569-00003",
    leaseId: null,
    unitId,
    state: "signed",
    sha256: MOCK_DOCUMENT_SHA,
    sentAt: bangkokIso(Date.now() - 42 * DAY),
    signedAt: signed,
    nextActions: ["download"],
    variables: {
      fee: "5000.00",
      rent: "15000.00",
      moveInDate: bangkokDate(Date.now() - 30 * DAY),
      expiresOn: bangkokDate(Date.now() - 35 * DAY),
      refundTerms: "คืนเงินจองเต็มจำนวนหากผู้ให้เช่ายกเลิก",
    },
    signers: base.signers.map((s) => ({ ...s, role: s.role === "prospect" ? "lessee" : s.role, signedAt: signed })),
  };
}

function offerFor(leaseId: string, unitId: string, rent: string, endDate: string): Offer {
  const base = example<Offer>("resident.renewals.get");
  const start = new Date(Date.parse(`${endDate}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  return {
    ...base,
    id: derived(leaseId, "e0f1"),
    leaseId,
    unitId,
    // The B7.5 letter of `mocks/resident.ts` (`noticesOf`) — the offer and the letter are one act.
    noticeId: derived(leaseId, "a0a1"),
    currentRent: rent,
    offeredRent: "15500.00",
    suggestedRent: "15500.00",
    months: 12,
    startDate: start,
    respondBy: bangkokDate(Date.now() + 20 * DAY),
    state: "offered",
    message: "ขอบคุณที่เช่ากับเรามาตลอดปีค่ะ ปีหน้าค่าเช่าปรับขึ้นเล็กน้อยตามราคาตลาด",
    newLeaseId: null,
    decidedAt: null,
    declineReason: null,
    nextActions: ["accept", "decline"],
    createdAt: bangkokIso(Date.now() - 2 * DAY),
  };
}

function stateOf(account: MockAccount): MockContracts {
  const existing = byUser.get(account.userId);
  if (existing) return existing;
  const state: MockContracts = { contracts: [], offers: [], challenges: new Map(), replays: new Map() };
  byUser.set(account.userId, state);
  const has = (word: string) => account.subject.toLowerCase().includes(word);
  const residence = residenceOf(account);
  const lease = residence.leases.find((l) => l.dto.status === "active")?.dto;
  const unitId = account.units[0]?.unitId;
  if (lease && unitId) {
    if (has("contracts")) state.contracts.push(addendum(residence, lease.id, unitId), reservation(lease.id, unitId));
    if (has("renewal")) state.offers.push(offerFor(lease.id, unitId, lease.rent, lease.endDate));
  }
  return state;
}

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Contract §3: the key is required; a replay answers the first response. */
function replayOf(state: MockContracts, request: Request, operationId: string) {
  const key = request.headers.get("idempotency-key");
  if (!key) return { response: problem(operationId, "idempotency.key_required") };
  if (!/^[0-9a-f-]{36}$/i.test(key)) return { response: problem(operationId, "idempotency.key_invalid") };
  const id = `${request.method} ${new URL(request.url).pathname} ${key}`;
  const seen = state.replays.get(id);
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

function remember(state: MockContracts, key: string, body: unknown): Response {
  state.replays.set(key, { status: 200, body });
  return HttpResponse.json(body as Record<string, unknown>);
}

const mySigner = (contract: Contract) => contract.signers.find((s) => s.partyId !== null && s.signedAt === null);

export const libraryContractHandlers: HttpHandler[] = [
  http.get(mswPath("/v1/resident/contracts"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.contracts.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json({ data: stateOf(auth.account).contracts } satisfies Schemas["ContractsDto"]);
  }),

  http.get(mswPath("/v1/resident/contracts/:contractId"), ({ request, params }) => {
    const op = "resident.contracts.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const contract = stateOf(auth.account).contracts.find((c) => c.id === params.contractId);
    return contract ? HttpResponse.json(contract) : problem(op, "http.not_found");
  }),

  http.get(mswPath("/v1/resident/contracts/:contractId/document"), ({ request, params }) => {
    const op = "resident.contracts.document";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const contract = stateOf(auth.account).contracts.find((c) => c.id === params.contractId);
    if (!contract) return problem(op, "http.not_found");
    return HttpResponse.json({
      documentId: derived(contract.id, "d0c1"),
      number: contract.number,
      sha256: MOCK_DOCUMENT_SHA,
      signed: contract.state === "signed",
      url: `https://storage.example.com/contracts/${contract.id}.pdf?X-Amz-Signature=mock`,
      expiresAt: bangkokIso(Date.now() + 5 * 60_000),
    } satisfies Schemas["ContractDownloadDto"]);
  }),

  http.post(mswPath("/v1/resident/contracts/:contractId/signature/otp"), ({ request, params }) => {
    const op = "resident.contracts.requestSignatureOtp";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const state = stateOf(auth.account);
    const contract = state.contracts.find((c) => c.id === params.contractId);
    if (!contract) return problem(op, "http.not_found");
    if (contract.state !== "pending_signature") return problem(op, "contract.invalid_state");
    if (!mySigner(contract)) return problem(op, "contract.already_signed");
    const challengeId = crypto.randomUUID();
    state.challenges.set(challengeId, { contractId: contract.id, attempts: 0 });
    const now = Date.now();
    return HttpResponse.json({
      challengeId,
      phoneMasked: "08•-•••-1234",
      expiresAt: bangkokIso(now + 5 * 60_000),
      resendAvailableAt: bangkokIso(now + 60_000),
    } satisfies Schemas["ResidentSignatureOtpDto"]);
  }),

  http.post(mswPath("/v1/resident/contracts/:contractId/sign"), async ({ request, params }) => {
    const op = "resident.contracts.sign";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const state = stateOf(auth.account);
    const replay = replayOf(state, request, op);
    if (replay.response) return replay.response;
    const contract = state.contracts.find((c) => c.id === params.contractId);
    if (!contract) return problem(op, "http.not_found");
    const body = await json<Partial<Schemas["ResidentSignDto"]>>(request);
    if (!body || typeof body.challengeId !== "string" || typeof body.code !== "string") {
      return problem(op, "validation.failed");
    }
    const signer = mySigner(contract);
    if (contract.state !== "pending_signature") return problem(op, "contract.invalid_state");
    if (!signer) return problem(op, "contract.already_signed");
    if (body.contractSha256?.toLowerCase() !== MOCK_DOCUMENT_SHA) return problem(op, "contract.changed");
    const png = typeof body.signaturePng === "string" ? body.signaturePng : "";
    if (!png.startsWith(PNG_MAGIC) || png.length > Math.ceil((200 * 1024 * 4) / 3)) {
      return problem(op, "contract.signature_invalid");
    }
    const challenge = state.challenges.get(body.challengeId);
    if (!challenge || challenge.contractId !== contract.id) return problem(op, "auth.otp_expired");
    if (body.code !== SIGNATURE_OTP) {
      challenge.attempts += 1;
      return problem(op, "auth.otp_invalid", { attemptsRemaining: 5 - challenge.attempts });
    }
    state.challenges.delete(body.challengeId);
    const now = bangkokIso(Date.now());
    const signers = contract.signers.map((s) => (s.index === signer.index ? { ...s, signedAt: now } : s));
    const complete = signers.every((s) => s.signedAt !== null);
    Object.assign(contract, {
      signers,
      state: complete ? "signed" : "pending_signature",
      signedAt: complete ? now : null,
      nextActions: ["download"],
    } satisfies Partial<Contract>);
    return remember(state, replay.key, contract);
  }),

  // ── renewal offers (D-294) ───────────────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/renewal-offers"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.renewals.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json({ data: stateOf(auth.account).offers } satisfies Schemas["RenewalOffersDto"]);
  }),

  http.get(mswPath("/v1/resident/renewal-offers/:offerId"), ({ request, params }) => {
    const op = "resident.renewals.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const offer = stateOf(auth.account).offers.find((o) => o.id === params.offerId);
    return offer ? HttpResponse.json(offer) : problem(op, "http.not_found");
  }),

  http.post(mswPath("/v1/resident/renewal-offers/:offerId/actions/accept"), ({ request, params }) => {
    const op = "resident.renewals.accept";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const state = stateOf(auth.account);
    const replay = replayOf(state, request, op);
    if (replay.response) return replay.response;
    const offer = state.offers.find((o) => o.id === params.offerId);
    if (!offer) return problem(op, "http.not_found");
    if (offer.state !== "offered") return problem(op, "renewal.invalid_state");
    // The renewal lease, drafted from `renew` and sent for my signature at once.
    const renewal = addPendingLease(auth.account);
    const residence = residenceOf(auth.account);
    const stored = residence.leases.find((l) => l.dto.id === renewal.id)!;
    const end = new Date(Date.parse(`${offer.startDate}T00:00:00Z`) + 365 * DAY - DAY).toISOString().slice(0, 10);
    stored.dto = { ...stored.dto, rent: offer.offeredRent, startDate: offer.startDate, endDate: end, months: 12 };
    Object.assign(offer, {
      state: "accepted",
      newLeaseId: renewal.id,
      decidedAt: bangkokIso(Date.now()),
      nextActions: [],
    } satisfies Partial<Offer>);
    return remember(state, replay.key, offer);
  }),

  http.post(mswPath("/v1/resident/renewal-offers/:offerId/actions/decline"), async ({ request, params }) => {
    const op = "resident.renewals.decline";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const state = stateOf(auth.account);
    const replay = replayOf(state, request, op);
    if (replay.response) return replay.response;
    const offer = state.offers.find((o) => o.id === params.offerId);
    if (!offer) return problem(op, "http.not_found");
    if (offer.state !== "offered") return problem(op, "renewal.invalid_state");
    const body = await json<{ reason?: unknown }>(request);
    if (body?.reason != null && (typeof body.reason !== "string" || body.reason.length > 500)) {
      return problem(op, "validation.failed");
    }
    const residence = residenceOf(auth.account);
    const lease = residence.leases.find((l) => l.dto.id === offer.leaseId);
    // ≥ 30 days left: my notice to the end date, then the move-out (D-219); fewer: the lease simply ends.
    if (lease && Date.parse(`${lease.dto.endDate}T00:00:00+07:00`) - Date.now() >= 30 * DAY) {
      giveNotice(lease, lease.dto.endDate, residence);
    }
    Object.assign(offer, {
      state: "declined",
      declineReason: typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null,
      decidedAt: bangkokIso(Date.now()),
      nextActions: [],
    } satisfies Partial<Offer>);
    return remember(state, replay.key, offer);
  }),
];
