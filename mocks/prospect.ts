/**
 * Prospects (L5 5.1, api B7.3): the public read of a listing and its free viewing times, and a prospect's own
 * enquiries and viewings — stateful per signed-in prospect, like the API. One live viewing per enquiry; a time taken
 * by anyone is no longer offered. The double-booking race is exercised with a forced problem
 * (`gp_mock=prospect.viewings.request=listing.viewing_slot_taken`).
 *
 * Self-viewing (GL2, api G7, D-295) is **off** like the API's `viewing.self.enabled` until the `gp_mock` cookie says
 * `viewing.self=on`: then the listing offers self slots (16:00–18:00), the prospect's requirements are checked
 * (e-KYC from `mocks/identity.ts`, a phone verified with the SMS code `123456`, visitor terms version 1), and
 * `POST /v1/prospect/__mock/viewings/{id}/confirm` plays the owner's confirmation (`{ "window": "now" }` opens the
 * door-code window at once). A subject with the word `selfview` starts verified with a confirmed self viewing whose
 * window is open now (Lighthouse `prospect` set).
 */
import { createHash } from "node:crypto";

import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { example, mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { identityVerifiedOf, seedIdentityVerified } from "./identity";
import type { MockAccount } from "./state";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];
type Enquiry = Schemas["ProspectEnquiryDto"];
type Viewing = Schemas["LeadViewingDto"];

/** The listing of the mock (the same slug getproperty-web's mock world publishes). */
export const MOCK_LISTING_SLUG = "condo-1br-a1b2c3d4e5";
const OWNER = "มาลี มีสุข";
const SLOT_MINUTES = 30;
const LIVE = new Set<Viewing["state"]>(["requested", "confirmed"]);
const MINUTE = 60_000;
/** `viewing.self.code_minutes` / `viewing.self.code_early_minutes` (the API's seeded defaults). */
const CODE_MINUTES = 30;
const EARLY_MINUTES = 5;
export const MOCK_OTP_CODE = "123456";
export const VISITOR_TERMS: Schemas["VisitorTermsDto"] = {
  version: 1,
  th: "ร่างเงื่อนไขผู้เข้าชม (รอตรวจทางกฎหมาย): ฉันจะเข้าชมห้องเฉพาะช่วงเวลาที่นัดไว้ จะไม่พาผู้อื่นที่ไม่ได้แจ้งไว้เข้าห้อง จะไม่ใช้ เคลื่อนย้าย หรือทำให้ทรัพย์สินในห้องเสียหาย จะปิดประตูและกดยืนยันการออกเมื่อชมเสร็จ และจะแจ้งทันทีหากพบความเสียหายหรือสิ่งผิดปกติ รหัสประตูใช้ได้เฉพาะช่วงเวลาที่นัดและห้ามส่งต่อให้ผู้อื่น",
  en: "Draft visitor terms (pending legal review): I will view the unit only during my booked time, bring no one I have not told the owner about, not use, move or damage anything in the unit, close the door and confirm leaving when I am done, and report any damage or anything unusual at once. The door code works only during my booked time and must not be passed on.",
};

interface SelfState {
  phone: string | null;
  challenges: Map<string, { phone: string; attempts: number }>;
  /** The door code of each confirmed self viewing — never part of a DTO except the access-code answer. */
  codes: Map<string, string>;
  seeded: boolean;
}

/** On `globalThis` like the rest of the mock state: Next bundles the BFF and the pages separately. */
const holder = globalThis as typeof globalThis & {
  __gpMockProspects?: {
    byUser: Map<string, Enquiry[]>;
    taken: Map<string, Set<string>>;
    self: Map<string, SelfState>;
  };
};
holder.__gpMockProspects ??= { byUser: new Map(), taken: new Map(), self: new Map() };
holder.__gpMockProspects.self ??= new Map();
const { byUser, taken, self } = holder.__gpMockProspects;

function selfOf(userId: string): SelfState {
  let state = self.get(userId);
  if (!state) {
    state = { phone: null, challenges: new Map(), codes: new Map(), seeded: false };
    self.set(userId, state);
  }
  return state;
}

/** `gp_mock` `viewing.self=on` (sent as `x-gp-mock`): the platform setting `viewing.self.enabled`. */
function selfOn(request: Request): boolean {
  return (request.headers.get("x-gp-mock") ?? "")
    .split(";")
    .some((pair) => pair.trim().replace(/\s/g, "") === "viewing.self=on");
}

export function uuidFrom(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The enquiry a `selfview` account starts with (Lighthouse URL: `uuidFrom(subject + ":lead")`). */
export function seededLeadId(subject: string): string {
  return uuidFrom(`${subject}:lead`);
}

function missingOf(userId: string): string[] {
  return [...(identityVerifiedOf(userId) ? [] : ["identity"]), ...(selfOf(userId).phone ? [] : ["phone"]), "terms"];
}

function masked(phone: string): string {
  const digits = phone.replace(/^\+66/, "0");
  return `${digits.slice(0, 2)}•-•••-${digits.slice(-4)}`;
}

function newCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/** Opens the door-code window of a confirmed self viewing: around its start, or from now when asked. */
function issueAccess(userId: string, viewing: Viewing, from: "now" | "slot"): void {
  const start = from === "now" ? Date.now() : Date.parse(viewing.startsAt);
  viewing.access = {
    state: "issued",
    validFrom: bangkokIso(start - EARLY_MINUTES * MINUTE),
    validTo: bangkokIso(start + CODE_MINUTES * MINUTE),
    enteredAt: null,
    enteredSource: null,
    exitedAt: null,
    closedAt: null,
    closeReason: null,
    incidentAt: null,
    incidentNote: null,
    workOrderId: null,
  };
  selfOf(userId).codes.set(viewing.id, newCode());
}

function closeAccess(viewing: Viewing, state: "cancelled" | "exited", reason: string): void {
  if (!viewing.access || viewing.access.closedAt) return;
  const at = bangkokIso(Date.now());
  viewing.access.state = state;
  viewing.access.closedAt = at;
  viewing.access.closeReason = reason;
  if (state === "exited") viewing.access.exitedAt = at;
}

function insideWindow(access: NonNullable<Viewing["access"]>, now = Date.now()): boolean {
  return now >= Date.parse(access.validFrom) && now < Date.parse(access.validTo);
}

/** A `selfview` account: verified identity and phone, and a confirmed self viewing whose window is open now. */
function seedSelfView(account: MockAccount): void {
  if (!account.subject.includes("selfview")) return;
  const state = selfOf(account.userId);
  if (state.seeded) return;
  state.seeded = true;
  seedIdentityVerified(account.userId);
  state.phone = "+66810001234";
  const { enquiry } = enquiryFor(account.userId, MOCK_LISTING_SLUG, {}, seededLeadId(account.subject));
  const start = Math.ceil(Date.now() / (30 * MINUTE)) * 30 * MINUTE;
  const viewing: Viewing = {
    id: uuidFrom(`${account.subject}:viewing`),
    startsAt: bangkokIso(start),
    endsAt: bangkokIso(start + SLOT_MINUTES * MINUTE),
    state: "confirmed",
    mode: "self",
    access: null,
    note: null,
    reason: null,
    cancelledBy: null,
    rescheduledTo: null,
  };
  enquiry.viewings.unshift(viewing);
  issueAccess(account.userId, viewing, "now");
}

/**
 * GL4 (api G8, D-299): more public listings, shown to a leaving resident in the destination they gave
 * (`mocks/relocation.ts`). Area = a slug of `MOCK_AREAS`; the first one is the listing of the mock above.
 */
export const NETWORK_LISTINGS: { slug: string; area: string; title: string; rent: string; district: string }[] = [
  {
    slug: MOCK_LISTING_SLUG,
    area: "ari",
    title: "คอนโด 1 ห้องนอน ใกล้ BTS อารีย์ วิวเมือง",
    rent: "15000.00",
    district: "พญาไท",
  },
  {
    slug: "room-studio-b7c8d9e0f1",
    area: "ari",
    title: "ห้องสตูดิโอ ซอยอารีย์ 4 เดินถึง BTS",
    rent: "8500.00",
    district: "พญาไท",
  },
  {
    slug: "condo-2br-c1d2e3f4a5",
    area: "chatuchak",
    title: "คอนโด 2 ห้องนอน ใกล้ MRT จตุจักร",
    rent: "22000.00",
    district: "จตุจักร",
  },
  {
    slug: "room-studio-d4e5f6a7b8",
    area: "chatuchak",
    title: "ห้องพักรายเดือน ใกล้ตลาดนัดจตุจักร",
    rent: "7000.00",
    district: "จตุจักร",
  },
];

function networkDetail(slug: string): Schemas["PublicListingDetailDto"] | null {
  const listing = NETWORK_LISTINGS.find((l) => l.slug === slug && l.slug !== MOCK_LISTING_SLUG);
  if (!listing) return null;
  const base = example<Schemas["PublicListingDetailDto"]>("public.listings.get");
  return {
    ...base,
    slug,
    title: listing.title,
    rent: listing.rent,
    ownerDisplayName: "วิภา ศรีสุข",
    address: `${listing.district}, กรุงเทพมหานคร`,
    district: listing.district,
    province: "กรุงเทพมหานคร",
    cover: null,
    photos: [],
  };
}

/** A public listing of the mock — the detail page's DTO; the summary is the same shape minus the detail fields. */
export function publicListing(slug: string): Schemas["PublicListingDetailDto"] | null {
  return detail(slug);
}

function detail(slug: string): Schemas["PublicListingDetailDto"] | null {
  if (slug !== MOCK_LISTING_SLUG) return networkDetail(slug);
  const base = example<Schemas["PublicListingDetailDto"]>("public.listings.get");
  return {
    ...base,
    slug,
    title: "คอนโด 1 ห้องนอน ใกล้ BTS อารีย์ วิวเมือง",
    rent: "15000.00",
    ownerDisplayName: OWNER,
    verifiedOwner: true,
    address: "ถนนพหลโยธิน, พญาไท, กรุงเทพมหานคร 10400",
    district: "พญาไท",
    province: "กรุงเทพมหานคร",
    cover: null,
    photos: [],
  };
}

/**
 * Every slot from tomorrow for `days` days (the API applies notice and horizon): accompanied 10:00–16:00 Bangkok and,
 * while self-viewing is on, self slots 16:00–18:00.
 */
function slotsFor(slug: string, days: number, withSelf = false): Schemas["ViewingSlotDto"][] {
  const used = taken.get(slug) ?? new Set<string>();
  const out: Schemas["ViewingSlotDto"][] = [];
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  for (let d = 1; d <= days; d++) {
    const day = new Date(Date.parse(`${today}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
    const until = withSelf ? 18 * 60 : 16 * 60;
    for (let minute = 10 * 60; minute + SLOT_MINUTES <= until; minute += SLOT_MINUTES) {
      const start = Date.parse(`${day}T00:00:00+07:00`) + minute * 60_000;
      const startsAt = bangkokIso(start);
      if (used.has(startsAt)) continue;
      const mode = minute >= 16 * 60 ? "self" : "accompanied";
      out.push({ startsAt, endsAt: bangkokIso(start + SLOT_MINUTES * 60_000), mode });
    }
  }
  return out;
}

const normal = (iso: string) => bangkokIso(Date.parse(iso));

function enquiryFor(
  userId: string,
  slug: string,
  input: Record<string, unknown>,
  id: string = crypto.randomUUID(),
): { enquiry: Enquiry; created: boolean } {
  const list = byUser.get(userId) ?? [];
  byUser.set(userId, list);
  const open = list.find((e) => e.listing.slug === slug && e.open);
  if (open) return { enquiry: open, created: false };
  const listing = detail(slug)!;
  const now = bangkokIso(Date.now());
  const enquiry: Enquiry = {
    id,
    listing: {
      slug,
      titleTh: listing.title,
      titleEn: null,
      rent: listing.rent,
      district: listing.district,
      province: listing.province,
      ownerName: listing.ownerDisplayName,
      available: true,
    },
    open: true,
    moveInDate: typeof input.moveInDate === "string" ? input.moveInDate : null,
    termMonths: typeof input.termMonths === "number" ? input.termMonths : null,
    occupants: typeof input.occupants === "number" ? input.occupants : null,
    nationality: typeof input.nationality === "string" ? input.nationality : null,
    messages: [],
    viewings: [],
    createdAt: now,
    updatedAt: now,
  };
  list.push(enquiry);
  return { enquiry, created: true };
}

async function json(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function addMessage(enquiry: Enquiry, author: "prospect" | "owner", body: string) {
  const at = bangkokIso(Date.now());
  enquiry.messages.push({ id: crypto.randomUUID(), author, body, createdAt: at });
  enquiry.updatedAt = at;
}

function myViewing(userId: string, viewingId: string): { enquiry: Enquiry; viewing: Viewing } | null {
  for (const enquiry of byUser.get(userId) ?? []) {
    const viewing = enquiry.viewings.find((v) => v.id === viewingId);
    if (viewing) return { enquiry, viewing };
  }
  return null;
}

function free(slug: string, startsAt: string) {
  taken.get(slug)?.delete(normal(startsAt));
}

export const prospectHandlers: HttpHandler[] = [
  http.get(mswPath("/v1/public/listings/{slug}/viewing-slots"), ({ request, params }) => {
    const slug = String(params.slug);
    if (!detail(slug)) return problem("public.listings.viewingSlots", "http.not_found");
    const days = Math.min(60, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 14));
    const on = selfOn(request);
    return HttpResponse.json({
      slotMinutes: SLOT_MINUTES,
      selfViewing: on,
      slots: slotsFor(slug, days, on),
    } satisfies Schemas["ViewingSlotsDto"]);
  }),
  http.get(mswPath("/v1/public/listings/{slug}"), ({ params }) => {
    const listing = detail(String(params.slug));
    return listing ? HttpResponse.json(listing) : problem("public.listings.get", "http.not_found");
  }),
  http.get(mswPath("/v1/prospect/me"), ({ request }) => {
    const auth = authenticate(request, "prospect", "prospect.me.get");
    if (auth instanceof Response) return auth;
    seedSelfView(auth.account);
    const list = byUser.get(auth.account.userId) ?? [];
    const base = example<Schemas["ProspectMeDto"]>("prospect.me.get");
    return HttpResponse.json({
      ...base,
      user: { ...base.user, id: auth.account.userId, displayName: auth.account.displayName },
      openEnquiries: list.filter((e) => e.open).length,
      upcomingViewings: list.flatMap((e) => e.viewings).filter((v) => LIVE.has(v.state)).length,
    } satisfies Schemas["ProspectMeDto"]);
  }),
  http.get(mswPath("/v1/prospect/enquiries"), ({ request }) => {
    const auth = authenticate(request, "prospect", "prospect.enquiries.list");
    if (auth instanceof Response) return auth;
    seedSelfView(auth.account);
    return HttpResponse.json(byUser.get(auth.account.userId) ?? []);
  }),
  http.get(mswPath("/v1/prospect/enquiries/{leadId}"), ({ request, params }) => {
    const auth = authenticate(request, "prospect", "prospect.enquiries.get");
    if (auth instanceof Response) return auth;
    seedSelfView(auth.account);
    const enquiry = (byUser.get(auth.account.userId) ?? []).find((e) => e.id === params.leadId);
    return enquiry ? HttpResponse.json(enquiry) : problem("prospect.enquiries.get", "http.not_found");
  }),
  http.post(mswPath("/v1/prospect/listings/{slug}/enquiries"), async ({ request, params }) => {
    const op = "prospect.enquiries.create";
    const auth = authenticate(request, "prospect", op);
    if (auth instanceof Response) return auth;
    const slug = String(params.slug);
    if (!detail(slug)) return problem(op, "http.not_found");
    const body = await json(request);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return problem(op, "validation.failed");
    const known = (byUser.get(auth.account.userId) ?? []).some((e) => e.listing.slug === slug);
    if (!known && body.consent !== true) return problem(op, "listing.consent_required");
    const { enquiry } = enquiryFor(auth.account.userId, slug, body);
    addMessage(enquiry, "prospect", message);
    return HttpResponse.json(enquiry, { status: 201 });
  }),
  http.post(mswPath("/v1/prospect/listings/{slug}/viewings"), async ({ request, params }) => {
    const op = "prospect.viewings.request";
    const auth = authenticate(request, "prospect", op);
    if (auth instanceof Response) return auth;
    const slug = String(params.slug);
    if (!detail(slug)) return problem(op, "http.not_found");
    const body = await json(request);
    const mode: Viewing["mode"] = body.mode === "self" ? "self" : "accompanied";
    const userId = auth.account.userId;
    if (mode === "self") {
      if (!selfOn(request)) return problem(op, "viewing.self_unavailable", { selfViewingReason: "disabled" });
      const missing = missingOf(userId).filter((m) => m !== "terms" || body.visitorTermsVersion == null);
      if (missing.length) return problem(op, "viewing.requirements_missing", { missingRequirements: missing });
      if (body.visitorTermsVersion !== VISITOR_TERMS.version) {
        return problem(op, "viewing.terms_outdated", { visitorTermsVersion: VISITOR_TERMS.version });
      }
      const open = (byUser.get(userId) ?? [])
        .flatMap((e) => e.viewings)
        .some((v) => v.mode === "self" && LIVE.has(v.state));
      if (open) return problem(op, "viewing.access_overlap");
    }
    const startsAt = typeof body.startsAt === "string" ? normal(body.startsAt) : "";
    const slot = slotsFor(slug, 60, selfOn(request)).find((s) => s.startsAt === startsAt && s.mode === mode);
    if (!slot) {
      return (taken.get(slug)?.has(startsAt) ?? false)
        ? problem(op, "listing.viewing_slot_taken")
        : problem(op, "listing.viewing_slot_unavailable");
    }
    const known = (byUser.get(auth.account.userId) ?? []).some((e) => e.listing.slug === slug);
    if (!known && body.consent !== true) return problem(op, "listing.consent_required");
    const { enquiry } = enquiryFor(auth.account.userId, slug, body);
    if (enquiry.viewings.some((v) => LIVE.has(v.state))) return problem(op, "listing.viewing_exists");
    taken.set(slug, (taken.get(slug) ?? new Set()).add(slot.startsAt));
    enquiry.viewings.unshift({
      id: crypto.randomUUID(),
      ...slot,
      access: null,
      state: "requested",
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
      reason: null,
      cancelledBy: null,
      rescheduledTo: null,
    });
    enquiry.updatedAt = bangkokIso(Date.now());
    return HttpResponse.json(enquiry, { status: 201 });
  }),
  http.post(mswPath("/v1/prospect/enquiries/{leadId}/messages"), async ({ request, params }) => {
    const op = "prospect.enquiries.write";
    const auth = authenticate(request, "prospect", op);
    if (auth instanceof Response) return auth;
    const enquiry = (byUser.get(auth.account.userId) ?? []).find((e) => e.id === params.leadId);
    if (!enquiry) return problem(op, "http.not_found");
    if (!enquiry.open) return problem(op, "listing.lead_invalid_state");
    const body = await json(request);
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) return problem(op, "validation.failed");
    addMessage(enquiry, "prospect", text);
    return HttpResponse.json(enquiry, { status: 201 });
  }),
  http.post(mswPath("/v1/prospect/viewings/{viewingId}/actions/cancel"), ({ request, params }) => {
    const op = "prospect.viewings.cancel";
    const auth = authenticate(request, "prospect", op);
    if (auth instanceof Response) return auth;
    const found = myViewing(auth.account.userId, String(params.viewingId));
    if (!found) return problem(op, "http.not_found");
    if (!LIVE.has(found.viewing.state)) return problem(op, "listing.viewing_invalid_state");
    found.viewing.state = "cancelled";
    found.viewing.cancelledBy = "prospect";
    closeAccess(found.viewing, "cancelled", "cancelled");
    free(found.enquiry.listing.slug, found.viewing.startsAt);
    return HttpResponse.json(found.enquiry);
  }),
  http.post(mswPath("/v1/prospect/viewings/{viewingId}/actions/reschedule"), async ({ request, params }) => {
    const op = "prospect.viewings.reschedule";
    const auth = authenticate(request, "prospect", op);
    if (auth instanceof Response) return auth;
    const found = myViewing(auth.account.userId, String(params.viewingId));
    if (!found) return problem(op, "http.not_found");
    if (!LIVE.has(found.viewing.state)) return problem(op, "listing.viewing_invalid_state");
    const body = await json(request);
    const slug = found.enquiry.listing.slug;
    const startsAt = typeof body.startsAt === "string" ? normal(body.startsAt) : "";
    // A self viewing stays a self viewing (D-295): the new slot must be a self slot.
    const slot = slotsFor(slug, 60, selfOn(request)).find(
      (s) => s.startsAt === startsAt && s.mode === found.viewing.mode,
    );
    if (!slot) return problem(op, "listing.viewing_slot_unavailable");
    const id = crypto.randomUUID();
    found.viewing.state = "cancelled";
    found.viewing.cancelledBy = "prospect";
    found.viewing.rescheduledTo = id;
    closeAccess(found.viewing, "cancelled", "rescheduled");
    free(slug, found.viewing.startsAt);
    taken.set(slug, (taken.get(slug) ?? new Set()).add(slot.startsAt));
    found.enquiry.viewings.unshift({
      id,
      ...slot,
      access: null,
      state: "requested",
      note: found.viewing.note,
      reason: null,
      cancelledBy: null,
      rescheduledTo: null,
    });
    return HttpResponse.json(found.enquiry);
  }),
  ...selfViewingHandlers(),
];

/**
 * GL4 (D-299): the enquiry a leaving resident sends from a relocation offer — the same prospect enquiry as from the
 * listing page (same LINE login, B7.3), plus the message. `created` = a new enquiry, false = a message in the open one.
 */
export function enquireAsProspect(
  userId: string,
  slug: string,
  input: { message: string; moveInDate: string | null },
): { enquiry: Enquiry; created: boolean } | null {
  if (!detail(slug)) return null;
  const opened = enquiryFor(userId, slug, { moveInDate: input.moveInDate });
  addMessage(opened.enquiry, "prospect", input.message);
  return opened;
}

/** One of a prospect's enquiries (the rent record mock shares with it, D-256). */
export function enquiryOf(userId: string, leadId: string): Enquiry | undefined {
  return (byUser.get(userId) ?? []).find((e) => e.id === leadId);
}

/** GL2 (api G7, D-295): requirements, phone, door code, arrive / leave / incident and the owner's confirm (mock). */
function selfViewingHandlers(): HttpHandler[] {
  const viewingOf = (request: Request, op: string, viewingId: string) => {
    const auth = authenticate(request, "prospect", op);
    if (auth instanceof Response) return auth;
    seedSelfView(auth.account);
    const found = myViewing(auth.account.userId, viewingId);
    if (!found) return problem(op, "http.not_found");
    return { ...found, userId: auth.account.userId };
  };
  const summary = (viewing: Viewing) => HttpResponse.json(viewing.access);

  return [
    http.get(mswPath("/v1/prospect/me/self-viewing"), ({ request }) => {
      const auth = authenticate(request, "prospect", "prospect.selfViewing.status");
      if (auth instanceof Response) return auth;
      seedSelfView(auth.account);
      const userId = auth.account.userId;
      return HttpResponse.json({
        enabled: selfOn(request),
        identityVerified: identityVerifiedOf(userId),
        phoneVerified: selfOf(userId).phone !== null,
        missing: missingOf(userId),
        visitorTerms: VISITOR_TERMS,
        codeMinutes: CODE_MINUTES,
        earlyMinutes: EARLY_MINUTES,
      } satisfies Schemas["SelfViewingStatusDto"]);
    }),
    http.post(mswPath("/v1/prospect/me/phone/otp"), async ({ request }) => {
      const op = "prospect.phone.requestCode";
      const auth = authenticate(request, "prospect", op);
      if (auth instanceof Response) return auth;
      const body = await json(request);
      const raw = typeof body.phone === "string" ? body.phone.replace(/[\s-]/g, "") : "";
      const phone = /^\+66\d{8,9}$/.test(raw) ? raw : /^0\d{8,9}$/.test(raw) ? `+66${raw.slice(1)}` : null;
      if (!phone) return problem(op, "validation.failed");
      const challengeId = crypto.randomUUID();
      selfOf(auth.account.userId).challenges.set(challengeId, { phone, attempts: 0 });
      return HttpResponse.json({
        challengeId,
        expiresAt: bangkokIso(Date.now() + 5 * MINUTE),
        resendAvailableAt: bangkokIso(Date.now() + MINUTE),
      } satisfies Schemas["OtpChallengeDto"]);
    }),
    http.post(mswPath("/v1/prospect/me/phone"), async ({ request }) => {
      const op = "prospect.phone.verify";
      const auth = authenticate(request, "prospect", op);
      if (auth instanceof Response) return auth;
      const state = selfOf(auth.account.userId);
      const body = await json(request);
      const pending = typeof body.challengeId === "string" ? state.challenges.get(body.challengeId) : undefined;
      if (!pending) return problem(op, "auth.otp_expired");
      if (body.code !== MOCK_OTP_CODE) {
        pending.attempts += 1;
        if (pending.attempts >= 5) {
          state.challenges.delete(String(body.challengeId));
          return problem(op, "auth.otp_attempts_exceeded");
        }
        return problem(op, "auth.otp_invalid", { attemptsRemaining: 5 - pending.attempts });
      }
      state.challenges.delete(String(body.challengeId));
      // Numbers ending 9999 belong to another account in the mock (`auth.identity_in_use`).
      if (pending.phone.endsWith("9999")) return problem(op, "auth.identity_in_use");
      state.phone = pending.phone;
      return HttpResponse.json({
        phoneMasked: masked(pending.phone),
        phoneVerified: true,
      } satisfies Schemas["ProspectPhoneDto"]);
    }),
    http.get(mswPath("/v1/prospect/viewings/{viewingId}/access-code"), ({ request, params }) => {
      const op = "prospect.selfViewing.accessCode";
      const found = viewingOf(request, op, String(params.viewingId));
      if (found instanceof Response) return found;
      const { viewing, userId } = found;
      const access = viewing.access;
      if (viewing.mode !== "self" || viewing.state !== "confirmed" || !access) return problem(op, "http.not_found");
      if (access.closedAt || !insideWindow(access)) {
        return problem(op, "viewing.code_not_available", {
          codeValidFrom: access.validFrom,
          codeValidTo: access.validTo,
        });
      }
      return HttpResponse.json(
        {
          viewingId: viewing.id,
          doorCode: selfOf(userId).codes.get(viewing.id) ?? newCode(),
          validFrom: access.validFrom,
          validTo: access.validTo,
          locks: [
            { name: "ประตูห้อง A-102", scope: "unit", ready: true },
            { name: "ประตูทางเข้าอาคาร", scope: "building_door", ready: true },
          ],
        } satisfies Schemas["ViewingAccessCodeDto"],
        { headers: { "cache-control": "no-store" } },
      );
    }),
    http.post(mswPath("/v1/prospect/viewings/{viewingId}/actions/arrive"), ({ request, params }) => {
      const op = "prospect.selfViewing.arrive";
      const found = viewingOf(request, op, String(params.viewingId));
      if (found instanceof Response) return found;
      const access = found.viewing.access;
      if (!access) return problem(op, "viewing.access_invalid_state");
      if (access.state === "entered") return summary(found.viewing);
      if (access.state !== "issued" || !insideWindow(access)) return problem(op, "viewing.access_invalid_state");
      access.state = "entered";
      access.enteredAt = bangkokIso(Date.now());
      access.enteredSource = "prospect";
      return summary(found.viewing);
    }),
    http.post(mswPath("/v1/prospect/viewings/{viewingId}/actions/leave"), ({ request, params }) => {
      const op = "prospect.selfViewing.leave";
      const found = viewingOf(request, op, String(params.viewingId));
      if (found instanceof Response) return found;
      const access = found.viewing.access;
      if (!access || (access.state !== "issued" && access.state !== "entered")) {
        return problem(op, "viewing.access_invalid_state");
      }
      closeAccess(found.viewing, "exited", "left");
      found.viewing.state = "completed";
      selfOf(found.userId).codes.delete(found.viewing.id);
      return summary(found.viewing);
    }),
    http.post(mswPath("/v1/prospect/viewings/{viewingId}/actions/report-incident"), async ({ request, params }) => {
      const op = "prospect.selfViewing.reportIncident";
      const found = viewingOf(request, op, String(params.viewingId));
      if (found instanceof Response) return found;
      const body = await json(request);
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (note.length < 3 || note.length > 2000) return problem(op, "validation.failed");
      const access = found.viewing.access;
      if (!access || access.incidentAt) return problem(op, "viewing.access_invalid_state");
      access.incidentAt = bangkokIso(Date.now());
      access.incidentNote = note;
      access.workOrderId = crypto.randomUUID();
      return summary(found.viewing);
    }),
    // Mock only (not in the contract): the owner confirms a viewing; a self viewing gets its door-code window.
    http.post("*/v1/prospect/__mock/viewings/:viewingId/confirm", async ({ request, params }) => {
      const auth = authenticate(request, "prospect", "prospect.enquiries.get");
      if (auth instanceof Response) return auth;
      const found = myViewing(auth.account.userId, String(params.viewingId));
      if (!found || found.viewing.state !== "requested") return new HttpResponse(null, { status: 404 });
      const body = await json(request);
      found.viewing.state = "confirmed";
      if (found.viewing.mode === "self")
        issueAccess(auth.account.userId, found.viewing, body.window === "now" ? "now" : "slot");
      return HttpResponse.json(found.enquiry);
    }),
  ];
}
