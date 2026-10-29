import type { Locale } from "@/i18n/routing";
import type { ConsentPurpose, Schemas } from "@/lib/api/types";

export type RelocationOffer = Schemas["RelocationOfferDto"];
export type RelocationOffers = Schemas["RelocationOffersDto"];
export type ListingSummary = Schemas["PublicListingSummaryDto"];
export type PublicArea = Schemas["PublicAreaDto"];

/** Collective's own optional purpose for relocation offers (D-299) — separate from every service consent. */
export const RELOCATION_PURPOSE = "resident.relocation";

/**
 * Consent texts are published in Thai and English only (⚖ drafts): Thai readers get Thai, everyone else English —
 * asked for with `Accept-Language: en`, never translated here (O-035 (d), as GL1's O-023).
 */
export function consentLanguage(locale: Locale): "th" | "en" {
  return locale === "th" ? "th" : "en";
}

/** True when the page shows the English text to someone reading another language than English. */
export function englishForOthers(locale: Locale): boolean {
  return locale !== "th" && locale !== "en";
}

export function relocationPurpose(purposes: readonly ConsentPurpose[]): ConsentPurpose | null {
  return purposes.find((p) => p.key === RELOCATION_PURPOSE) ?? null;
}

/**
 * - `on`: granted at the current version;
 * - `outdated`: granted an earlier version — the new text asks again;
 * - `off`: never answered, or withdrawn.
 */
export function purposeState(purpose: Pick<ConsentPurpose, "granted" | "grantedVersion" | "version">) {
  if (purpose.granted === true && purpose.grantedVersion === purpose.version) return "on" as const;
  return purpose.grantedVersion !== null && purpose.grantedVersion < purpose.version && purpose.granted !== false
    ? ("outdated" as const)
    : ("off" as const);
}

/** Open offers first (newest first), then the closed ones. */
export function sortOffers(offers: readonly RelocationOffer[]): RelocationOffer[] {
  return [...offers].sort(
    (a, b) => Number(b.state === "open") - Number(a.state === "open") || b.createdAt.localeCompare(a.createdAt),
  );
}

export type DestinationMode = "area" | "place";

export interface DestinationDraft {
  mode: DestinationMode;
  areaSlug: string;
  province: string;
  district: string;
  maxRent: string;
}

/** `8000.00` → `8000` for the input (string slicing only — money is never computed here). */
export function wholeBaht(amount: string): string {
  return /^\d+\.0+$/.test(amount) ? amount.replace(/\.0+$/, "") : amount;
}

export function draftFrom(offer: Pick<RelocationOffer, "destination">): DestinationDraft {
  const d = offer.destination;
  return {
    mode: d && !d.areaSlug && d.province ? "place" : "area",
    areaSlug: d?.areaSlug ?? "",
    province: d?.province ?? "",
    district: d?.district ?? "",
    maxRent: d?.maxRent ? wholeBaht(d.maxRent) : "",
  };
}

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

export type DestinationField = "areaSlug" | "province" | "district" | "maxRent";

/** Format checks only (the API answers the rest as field errors) — so a typo never reaches the API. */
export function destinationProblems(draft: DestinationDraft): DestinationField[] {
  const problems: DestinationField[] = [];
  if (draft.mode === "area" && !draft.areaSlug) problems.push("areaSlug");
  if (draft.mode === "place" && !draft.province.trim()) problems.push("province");
  const rent = draft.maxRent.trim().replace(/,/g, "");
  if (rent && !MONEY.test(rent)) problems.push("maxRent");
  return problems;
}

/** The `PUT …/destination` body: an area, or a province (+ district) — never both — and the highest rent. */
export function destinationBody(draft: DestinationDraft): Schemas["RelocationDestinationDto"] {
  const text = (value: string) => (value.trim() ? value.trim() : null);
  const rent = text(draft.maxRent.replace(/,/g, ""));
  return draft.mode === "area"
    ? { areaSlug: draft.areaSlug, province: null, district: null, maxRent: rent }
    : { areaSlug: null, province: text(draft.province), district: text(draft.district), maxRent: rent };
}

export function destinationFieldOf(path: string): DestinationField | null {
  const match = /^(areaSlug|province|district|maxRent)\b/.exec(path);
  return match ? (match[1] as DestinationField) : null;
}

/** An area's name in the reader's language (the API gives Thai and English). */
export function areaName(area: Pick<PublicArea, "name" | "nameEn">, locale: Locale): string {
  return locale === "th" ? area.name : area.nameEn || area.name;
}

/** Areas and stations matching the typed text (Thai or English), the chosen one left out. */
export function matchAreas(areas: readonly PublicArea[], query: string, chosen: string, limit = 8): PublicArea[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return areas
    .filter((area) => area.slug !== chosen)
    .filter((area) => area.name.toLowerCase().includes(q) || area.nameEn.toLowerCase().includes(q))
    .slice(0, limit);
}

/** What the destination reads as on the offer: the area's name, or "district, province". */
export function destinationLabel(
  destination: NonNullable<RelocationOffer["destination"]>,
  areas: readonly PublicArea[] | null,
  locale: Locale,
): string {
  if (destination.areaSlug) {
    const area = areas?.find((a) => a.slug === destination.areaSlug);
    return area ? areaName(area, locale) : destination.areaSlug;
  }
  return [destination.district, destination.province].filter(Boolean).join(", ");
}

/** Problems that mean "the consent is gone": the page goes back to the consent. */
export const CONSENT_GONE = new Set(["relocation.consent_required"]);

export interface EnquiryDraft {
  message: string;
  moveInDate: string;
  shareRentRecord: boolean;
  consent: boolean;
}

/** The `POST …/actions/enquire` body — the rent record travels only when the box was ticked now (D-256). */
export function enquiryBody(slug: string, draft: EnquiryDraft): Schemas["RelocationEnquireDto"] {
  return {
    listingSlug: slug,
    message: draft.message.trim(),
    moveInDate: draft.moveInDate || null,
    shareRentRecord: draft.shareRentRecord,
    consent: draft.consent,
  };
}
