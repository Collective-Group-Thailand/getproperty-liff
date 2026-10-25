/**
 * Prospects (L5 5.1, api B7.3): the public read of a listing and its free viewing times, and a prospect's own
 * enquiries and viewings — stateful per signed-in prospect, like the API. One live viewing per enquiry; a time taken
 * by anyone is no longer offered. The double-booking race is exercised with a forced problem
 * (`gp_mock=prospect.viewings.request=listing.viewing_slot_taken`).
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { example, mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];
type Enquiry = Schemas["ProspectEnquiryDto"];
type Viewing = Schemas["LeadViewingDto"];

/** The listing of the mock (the same slug getproperty-web's mock world publishes). */
export const MOCK_LISTING_SLUG = "condo-1br-a1b2c3d4e5";
const OWNER = "มาลี มีสุข";
const SLOT_MINUTES = 30;
const LIVE = new Set<Viewing["state"]>(["requested", "confirmed"]);

/** On `globalThis` like the rest of the mock state: Next bundles the BFF and the pages separately. */
const holder = globalThis as typeof globalThis & {
  __gpMockProspects?: { byUser: Map<string, Enquiry[]>; taken: Map<string, Set<string>> };
};
holder.__gpMockProspects ??= { byUser: new Map(), taken: new Map() };
const { byUser, taken } = holder.__gpMockProspects;

function detail(slug: string): Schemas["PublicListingDetailDto"] | null {
  if (slug !== MOCK_LISTING_SLUG) return null;
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

/** Every slot from tomorrow, 10:00–16:00 Bangkok, for `days` days (the API applies notice and horizon). */
function slotsFor(slug: string, days: number): Schemas["ViewingSlotDto"][] {
  const used = taken.get(slug) ?? new Set<string>();
  const out: Schemas["ViewingSlotDto"][] = [];
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  for (let d = 1; d <= days; d++) {
    const day = new Date(Date.parse(`${today}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
    for (let minute = 10 * 60; minute + SLOT_MINUTES <= 16 * 60; minute += SLOT_MINUTES) {
      const start = Date.parse(`${day}T00:00:00+07:00`) + minute * 60_000;
      const startsAt = bangkokIso(start);
      if (used.has(startsAt)) continue;
      out.push({ startsAt, endsAt: bangkokIso(start + SLOT_MINUTES * 60_000) });
    }
  }
  return out;
}

const normal = (iso: string) => bangkokIso(Date.parse(iso));

function enquiryFor(
  userId: string,
  slug: string,
  input: Record<string, unknown>,
): { enquiry: Enquiry; created: boolean } {
  const list = byUser.get(userId) ?? [];
  byUser.set(userId, list);
  const open = list.find((e) => e.listing.slug === slug && e.open);
  if (open) return { enquiry: open, created: false };
  const listing = detail(slug)!;
  const now = bangkokIso(Date.now());
  const enquiry: Enquiry = {
    id: crypto.randomUUID(),
    listing: {
      slug,
      titleTh: listing.title,
      titleEn: null,
      rent: listing.rent,
      district: listing.district,
      province: listing.province,
      ownerName: OWNER,
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
    return HttpResponse.json({ slotMinutes: SLOT_MINUTES, slots: slotsFor(slug, days) });
  }),
  http.get(mswPath("/v1/public/listings/{slug}"), ({ params }) => {
    const listing = detail(String(params.slug));
    return listing ? HttpResponse.json(listing) : problem("public.listings.get", "http.not_found");
  }),
  http.get(mswPath("/v1/prospect/me"), ({ request }) => {
    const auth = authenticate(request, "prospect", "prospect.me.get");
    if (auth instanceof Response) return auth;
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
    return HttpResponse.json(byUser.get(auth.account.userId) ?? []);
  }),
  http.get(mswPath("/v1/prospect/enquiries/{leadId}"), ({ request, params }) => {
    const auth = authenticate(request, "prospect", "prospect.enquiries.get");
    if (auth instanceof Response) return auth;
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
    const startsAt = typeof body.startsAt === "string" ? normal(body.startsAt) : "";
    const slot = slotsFor(slug, 60).find((s) => s.startsAt === startsAt);
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
    const slot = slotsFor(slug, 60).find((s) => s.startsAt === startsAt);
    if (!slot) return problem(op, "listing.viewing_slot_unavailable");
    const id = crypto.randomUUID();
    found.viewing.state = "cancelled";
    found.viewing.cancelledBy = "prospect";
    found.viewing.rescheduledTo = id;
    free(slug, found.viewing.startsAt);
    taken.set(slug, (taken.get(slug) ?? new Set()).add(slot.startsAt));
    found.enquiry.viewings.unshift({
      id,
      ...slot,
      state: "requested",
      note: found.viewing.note,
      reason: null,
      cancelledBy: null,
      rescheduledTo: null,
    });
    return HttpResponse.json(found.enquiry);
  }),
];
