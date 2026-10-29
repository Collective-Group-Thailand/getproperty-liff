/**
 * Relocation offers for leaving residents (GL4, api G8, D-299). Like the API, an offer exists only for a lease of mine
 * that is under notice **and** while I consent to `resident.relocation` (Collective's own purpose, never pre-ticked):
 * granting the consent while under notice opens one, withdrawing it closes every open offer as `withdrawn` and erases
 * its destination. The API opens offers from events; the mock derives them on read, which shows the same states.
 *
 * - destination = an area / station slug of `GET /v1/public/listings/areas` or a province (+ district) and a budget;
 *   the listings are the public ones of the mock there (`NETWORK_LISTINGS`), up to the budget;
 * - enquire = the prospect enquiry of the same LINE login (B7.3) and — only when asked — the rent record shared with
 *   it (B7.11); `rentRecordShared` is false when the record has no confirmed month (`gp_mock` `rent_record.none=1`);
 * - dismiss closes the offer and erases the destination; the consent stays.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { enquireAsProspect, NETWORK_LISTINGS, publicListing } from "./prospect";
import { MOCK_AREAS } from "./recommendations";
import { residenceOf } from "./residence";
import { shareWithEnquiry } from "./rentRecord";
import type { MockAccount } from "./state";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];
type Offer = Schemas["RelocationOfferDto"];

export const RELOCATION_PURPOSE = "resident.relocation";
/** `relocation.offer.max_listings` (the API's seeded default). */
const MAX_LISTINGS = 10;

interface StoredOffer {
  dto: Omit<Offer, "listings">;
  replays: Map<string, { status: number; body: unknown }>;
}

const holder = globalThis as typeof globalThis & { __gpMockRelocation?: Map<string, StoredOffer[]> };
holder.__gpMockRelocation ??= new Map();
const byUser = holder.__gpMockRelocation;

/** The offer id of a lease: derived, so a measured URL is stable (Lighthouse `relocation-reviews`). */
export const relocationOfferId = (leaseId: string) => `${leaseId.slice(0, -4)}f0a1`;

export function relocationConsented(account: MockAccount): boolean {
  const consent = account.consents.find((c) => c.key === RELOCATION_PURPOSE);
  return consent?.granted === true && consent.grantedVersion === consent.version;
}

/** Opens offers for leases under notice while consented; closes open ones when the consent is gone. */
function offersOf(account: MockAccount): StoredOffer[] {
  const list = byUser.get(account.userId) ?? [];
  byUser.set(account.userId, list);
  const consented = relocationConsented(account);
  if (consented) {
    const unit = account.units[0];
    for (const { dto: lease } of residenceOf(account).leases) {
      if (!lease.notice || list.some((o) => o.dto.leaseId === lease.id)) continue;
      list.push({
        dto: {
          id: relocationOfferId(lease.id),
          leaseId: lease.id,
          unitNo: lease.unitNo,
          landlordName: unit?.tenantName ?? lease.tenantName,
          moveOutDate: lease.notice.effectiveDate,
          state: "open",
          // `…relocating…` subjects already said where (Lighthouse measures a page with listings).
          destination: account.subject.toLowerCase().includes("relocating")
            ? { areaSlug: "ari", province: null, district: null, maxRent: null }
            : null,
          enquiredListingIds: [],
          createdAt: bangkokIso(Date.now()),
        },
        replays: new Map(),
      });
    }
  } else {
    for (const offer of list) {
      if (offer.dto.state === "open") Object.assign(offer.dto, { state: "withdrawn", destination: null });
    }
  }
  return list;
}

function summary(slug: string): Schemas["PublicListingSummaryDto"] | null {
  const detail = publicListing(slug);
  if (!detail) return null;
  return {
    slug: detail.slug,
    title: detail.title,
    unitKind: detail.unitKind,
    rent: detail.rent,
    depositMonths: detail.depositMonths,
    advanceMonths: detail.advanceMonths,
    minTermMonths: detail.minTermMonths,
    sizeSqm: detail.sizeSqm,
    bedrooms: detail.bedrooms,
    bathrooms: detail.bathrooms,
    furnishing: detail.furnishing,
    petsAllowed: detail.petsAllowed,
    availableFrom: detail.availableFrom,
    province: detail.province,
    district: detail.district,
    address: detail.address,
    nearestTransit: detail.nearestTransit,
    cover: detail.cover,
    verifiedOwner: detail.verifiedOwner,
    ownerIdentityVerified: detail.ownerIdentityVerified,
    verifiedVacant: detail.verifiedVacant,
    vacantSince: detail.vacantSince,
    sponsored: false,
    sponsoredLabel: null,
    publishedAt: detail.publishedAt,
  };
}

/** Listings id of a mock listing — derived from its slug (the summary carries no id; `enquiredListingIds` do). */
export function listingIdOf(slug: string): string {
  const hex = Buffer.from(slug).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function listingsFor(offer: StoredOffer, consented: boolean): Schemas["PublicListingSummaryDto"][] {
  const where = offer.dto.destination;
  if (!consented || offer.dto.state !== "open" || !where) return [];
  const area = where.areaSlug ? MOCK_AREAS.find((a) => a.slug === where.areaSlug) : null;
  return NETWORK_LISTINGS.filter((l) =>
    where.areaSlug
      ? l.area === where.areaSlug || (area !== null && area !== undefined && l.district === area.name)
      : where.province === "กรุงเทพมหานคร" && (!where.district || where.district === l.district),
  )
    .filter((l) => !where.maxRent || Number(l.rent) <= Number(where.maxRent))
    .slice(0, MAX_LISTINGS)
    .map((l) => summary(l.slug))
    .filter((l): l is Schemas["PublicListingSummaryDto"] => l !== null);
}

const view = (offer: StoredOffer, consented: boolean): Offer => ({
  ...offer.dto,
  listings: listingsFor(offer, consented),
});

async function json(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function mine(request: Request, operationId: string, offerId: unknown) {
  const auth = authenticate(request, "resident", operationId);
  if (auth instanceof Response) return auth;
  const offer = offersOf(auth.account).find((o) => o.dto.id === offerId);
  if (!offer) return problem(operationId, "http.not_found");
  return { account: auth.account, offer };
}

export const relocationHandlers: HttpHandler[] = [
  http.get(mswPath("/v1/resident/relocation-offers"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.relocationOffers.list");
    if (auth instanceof Response) return auth;
    const consented = relocationConsented(auth.account);
    return HttpResponse.json({
      consented,
      data: offersOf(auth.account).map((o) => view(o, consented)),
    } satisfies Schemas["RelocationOffersDto"]);
  }),

  http.put(mswPath("/v1/resident/relocation-offers/{offerId}/destination"), async ({ request, params }) => {
    const op = "resident.relocationOffers.setDestination";
    const found = mine(request, op, params.offerId);
    if (found instanceof Response) return found;
    const body = (await json(request)) ?? {};
    const areaSlug = text(body.areaSlug);
    const province = text(body.province);
    const district = text(body.district);
    const maxRent = text(body.maxRent);
    const errors: { path: string; code: string; message: string }[] = [];
    if (!areaSlug && !province) errors.push({ path: "areaSlug", code: "required", message: "an area or a province" });
    if (district && !province) errors.push({ path: "province", code: "required", message: "the province" });
    if (maxRent && (!MONEY.test(maxRent) || Number(maxRent) <= 0)) {
      errors.push({ path: "maxRent", code: "min", message: "above zero" });
    }
    if (errors.length) return problem(op, "validation.failed", { errors });
    if (!relocationConsented(found.account)) return problem(op, "relocation.consent_required");
    if (found.offer.dto.state !== "open") return problem(op, "relocation.invalid_state");
    found.offer.dto.destination = {
      areaSlug,
      province: areaSlug ? null : province,
      district: areaSlug ? null : district,
      maxRent: maxRent ? Number(maxRent).toFixed(2) : null,
    };
    return HttpResponse.json(view(found.offer, true));
  }),

  http.post(mswPath("/v1/resident/relocation-offers/{offerId}/actions/enquire"), async ({ request, params }) => {
    const op = "resident.relocationOffers.enquire";
    const key = request.headers.get("idempotency-key");
    if (!key) return problem(op, "idempotency.key_required");
    if (!/^[0-9a-f-]{36}$/i.test(key)) return problem(op, "idempotency.key_invalid");
    const found = mine(request, op, params.offerId);
    if (found instanceof Response) return found;
    const seen = found.offer.replays.get(key);
    if (seen) {
      return HttpResponse.json(seen.body as Record<string, unknown>, {
        status: seen.status,
        headers: { "idempotent-replayed": "true" },
      });
    }
    const body = (await json(request)) ?? {};
    const message = text(body.message);
    const slug = text(body.listingSlug);
    const moveInDate = text(body.moveInDate);
    if (!message || !slug || typeof body.shareRentRecord !== "boolean" || (moveInDate && !DAY.test(moveInDate))) {
      return problem(op, "validation.failed");
    }
    if (!relocationConsented(found.account)) return problem(op, "relocation.consent_required");
    if (found.offer.dto.state !== "open") return problem(op, "relocation.invalid_state");
    if (body.consent !== true) return problem(op, "listing.consent_required");
    const opened = enquireAsProspect(found.account.userId, slug, { message, moveInDate });
    if (!opened) return problem(op, "http.not_found");
    const shared = body.shareRentRecord ? shareWithEnquiry(found.account.userId, opened.enquiry, request) : null;
    const listingId = listingIdOf(slug);
    if (!found.offer.dto.enquiredListingIds.includes(listingId)) found.offer.dto.enquiredListingIds.push(listingId);
    const result: Schemas["RelocationEnquiryDto"] = {
      leadId: opened.enquiry.id,
      listingId,
      created: opened.created,
      rentRecordShared: shared !== null,
    };
    found.offer.replays.set(key, { status: 200, body: result });
    return HttpResponse.json(result);
  }),

  http.post(mswPath("/v1/resident/relocation-offers/{offerId}/actions/dismiss"), ({ request, params }) => {
    const op = "resident.relocationOffers.dismiss";
    const found = mine(request, op, params.offerId);
    if (found instanceof Response) return found;
    if (found.offer.dto.state !== "open") return problem(op, "relocation.invalid_state");
    Object.assign(found.offer.dto, { state: "dismissed", destination: null });
    return HttpResponse.json(view(found.offer, relocationConsented(found.account)));
  }),
];
