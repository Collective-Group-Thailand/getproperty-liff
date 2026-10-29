/**
 * Verified building reviews by residents (GL4, api G9, D-301, O-035). One review per lease, only with verified tenure,
 * with the explicit `review.publish` consent of the shown version (never assumed), text screened for personal data,
 * pre-moderated (`review.moderation.premoderate` on: a new review waits as `pending_moderation`).
 *
 * Eligibility by the scenario words of the LINE subject (`mocks/state.ts`):
 *
 *   (default)   `too_early` — the first day is three months after the lease start (`review.min_tenure_months`)
 *   …reviewer…  eligible (lived there since 2025-11, still living there)
 *   …reviewed…  eligible, and my published review with the owner's reply is already there
 *   …signer…    `not_started` (the lease never began)
 *
 * `POST /v1/resident/__mock/reviews/{leaseId}/moderate` plays the platform moderator (`{ "decision": "approve" |
 * "reject" | "hide", "reason"?, "reply"? }`) — not part of the API.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { residenceOf } from "./residence";
import { PURPOSES, type MockAccount } from "./state";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];
type Review = Schemas["MyReviewDto"];
type Eligibility = Schemas["ReviewEligibilityDto"];

export const REVIEW_PURPOSE = "review.publish";
const LANGUAGES = new Set(["th", "en", "my", "km", "lo", "zh"]);

interface StoredReviews {
  reviews: Map<string, Review>;
  replays: Map<string, { status: number; body: unknown }>;
}

const holder = globalThis as typeof globalThis & { __gpMockReviews?: Map<string, StoredReviews> };
holder.__gpMockReviews ??= new Map();
const byUser = holder.__gpMockReviews;

const has = (account: MockAccount, word: string) => account.subject.toLowerCase().includes(word);

/** `YYYY-MM-DD` + three calendar months (the API's `review.min_tenure_months`, end-of-month clamped). */
function plusMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

function eligibilityOf(account: MockAccount, lease: Schemas["ResidentLeaseDto"]): Eligibility {
  if (lease.status === "pending_signature" || has(account, "signer")) {
    return { eligible: false, reason: "not_started", eligibleFrom: null, tenure: null };
  }
  if (has(account, "reviewer") || has(account, "reviewed")) {
    return { eligible: true, reason: null, eligibleFrom: null, tenure: { from: "2025-11", to: null } };
  }
  return {
    eligible: false,
    reason: "too_early",
    eligibleFrom: plusMonths(lease.startDate, 3),
    tenure: { from: lease.startDate.slice(0, 7), to: null },
  };
}

function storeOf(account: MockAccount): StoredReviews {
  const existing = byUser.get(account.userId);
  if (existing) return existing;
  const store: StoredReviews = { reviews: new Map(), replays: new Map() };
  byUser.set(account.userId, store);
  const lease = residenceOf(account).leases[0]?.dto;
  if (lease && has(account, "reviewed")) {
    store.reviews.set(lease.id, {
      id: crypto.randomUUID(),
      state: "published",
      rating: 4,
      body: "ตึกสะอาด ลิฟต์เร็ว นิติฯ ตอบไว แต่ที่จอดรถน้อยช่วงเย็น",
      language: "th",
      tenure: { from: "2025-11", to: null },
      submittedAt: bangkokIso(Date.now() - 20 * 86_400_000),
      publishedAt: bangkokIso(Date.now() - 18 * 86_400_000),
      moderationReason: null,
      ownerReply: "ขอบคุณสำหรับรีวิวค่ะ เรากำลังเพิ่มที่จอดรถชั้น B2 ภายในปีนี้",
      ownerRepliedAt: bangkokIso(Date.now() - 10 * 86_400_000),
    });
  }
  return store;
}

/** The `review.publish` text in the API's languages (th, else English — other languages read English, O-035). */
function consentText(request: Request): Schemas["ConsentPurposeTextDto"] {
  const english = !(request.headers.get("accept-language") ?? "th").toLowerCase().startsWith("th");
  const text = PURPOSES[REVIEW_PURPOSE][english ? "en" : "th"];
  return { purposeKey: REVIEW_PURPOSE, version: 1, title: text.title, bodyMarkdown: text.body };
}

/**
 * The API's screening (`review-rules.ts`): phone numbers, e-mail, LINE ids, links, bank accounts and 13-digit ID
 * numbers are refused — a simplified copy for the mock.
 */
export function carriesPersonalData(body: string): boolean {
  const digits = body.replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
  return (
    /(?:\+66|\b0)[\s-]?\d(?:[\s-]?\d){7,8}\b/.test(digits) ||
    /[\w.+-]+@[\w-]+\.[\w.]+/.test(digits) ||
    /\b(?:https?:\/\/|www\.)\S+/i.test(digits) ||
    /\bline\s*(?:id)?\s*[:：]\s*@?\w+/i.test(digits) ||
    /\b\d(?:[\s-]?\d){9,12}\b/.test(digits)
  );
}

function leaseOf(account: MockAccount, leaseId: unknown) {
  return residenceOf(account).leases.find((l) => l.dto.id === leaseId)?.dto ?? null;
}

async function json(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const reviewHandlers: HttpHandler[] = [
  http.get(mswPath("/v1/resident/leases/{leaseId}/review"), ({ request, params }) => {
    const op = "resident.reviews.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const lease = leaseOf(auth.account, params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    return HttpResponse.json({
      eligibility: eligibilityOf(auth.account, lease),
      review: storeOf(auth.account).reviews.get(lease.id) ?? null,
      consent: consentText(request),
    } satisfies Schemas["ResidentReviewDto"]);
  }),

  http.post(mswPath("/v1/resident/leases/{leaseId}/review"), async ({ request, params }) => {
    const op = "resident.reviews.submit";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const key = request.headers.get("idempotency-key");
    if (!key) return problem(op, "idempotency.key_required");
    if (!/^[0-9a-f-]{36}$/i.test(key)) return problem(op, "idempotency.key_invalid");
    const store = storeOf(auth.account);
    const replayId = `${String(params.leaseId)} ${key}`;
    const seen = store.replays.get(replayId);
    if (seen) {
      return HttpResponse.json(seen.body as Record<string, unknown>, {
        status: seen.status,
        headers: { "idempotent-replayed": "true" },
      });
    }
    const lease = leaseOf(auth.account, params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    const body = (await json(request)) ?? {};
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const errors: { path: string; code: string; message: string }[] = [];
    if (!Number.isInteger(body.rating) || (body.rating as number) < 1 || (body.rating as number) > 5) {
      errors.push({ path: "rating", code: "range", message: "1 to 5" });
    }
    if (text.length < 10 || text.length > 2000) errors.push({ path: "body", code: "length", message: "10 to 2000" });
    if (body.language != null && !LANGUAGES.has(String(body.language))) {
      errors.push({ path: "language", code: "enum", message: "a resident language" });
    }
    if (!Number.isInteger(body.consentVersion)) {
      errors.push({ path: "consentVersion", code: "required", message: "the version read" });
    }
    if (errors.length) return problem(op, "validation.failed", { errors });
    if (store.reviews.has(lease.id)) return problem(op, "review.already_submitted");
    const eligibility = eligibilityOf(auth.account, lease);
    if (!eligibility.eligible) {
      return problem(op, "review.not_eligible", { reviewEligibleFrom: eligibility.eligibleFrom });
    }
    if (body.consentVersion !== 1) return problem(op, "review.consent_required");
    if (carriesPersonalData(text)) return problem(op, "review.personal_data");
    const now = bangkokIso(Date.now());
    const review: Review = {
      id: crypto.randomUUID(),
      state: "pending_moderation",
      rating: body.rating as number,
      body: text,
      language: typeof body.language === "string" ? body.language : "th",
      tenure: eligibility.tenure ?? { from: lease.startDate.slice(0, 7), to: null },
      submittedAt: now,
      publishedAt: null,
      moderationReason: null,
      ownerReply: null,
      ownerRepliedAt: null,
    };
    store.reviews.set(lease.id, review);
    const consent = auth.account.consents.find((c) => c.key === REVIEW_PURPOSE);
    if (consent) Object.assign(consent, { granted: true, grantedVersion: 1, capturedAt: now });
    store.replays.set(replayId, { status: 201, body: review });
    return HttpResponse.json(review, { status: 201 });
  }),

  http.post(mswPath("/v1/resident/leases/{leaseId}/review/actions/withdraw"), ({ request, params }) => {
    const op = "resident.reviews.withdraw";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const review = storeOf(auth.account).reviews.get(String(params.leaseId));
    if (!review) return problem(op, "http.not_found");
    Object.assign(review, { state: "withdrawn", body: null } satisfies Partial<Review>);
    return HttpResponse.json(review);
  }),

  http.post("*/v1/resident/__mock/reviews/:leaseId/moderate", async ({ request, params }) => {
    const auth = authenticate(request, "resident", "resident.reviews.get");
    if (auth instanceof Response) return auth;
    const review = storeOf(auth.account).reviews.get(String(params.leaseId));
    if (!review) return problem("resident.reviews.get", "http.not_found");
    const body = (await json(request)) ?? {};
    const now = bangkokIso(Date.now());
    if (body.decision === "approve") Object.assign(review, { state: "published", publishedAt: now });
    else if (body.decision === "reject") {
      Object.assign(review, { state: "rejected", moderationReason: String(body.reason ?? "ข้อความไม่เกี่ยวกับอาคาร") });
    } else if (body.decision === "hide") {
      Object.assign(review, { state: "hidden", moderationReason: String(body.reason ?? "ถ้อยคำไม่สุภาพ") });
    }
    if (typeof body.reply === "string") Object.assign(review, { ownerReply: body.reply, ownerRepliedAt: now });
    return HttpResponse.json(review);
  }),
];
