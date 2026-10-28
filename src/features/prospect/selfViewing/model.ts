import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";

export type ViewingMode = Schemas["ViewingMode"];
export type AccessSummary = Schemas["ViewingAccessSummaryDto"];
export type SelfViewingStatus = Schemas["SelfViewingStatusDto"];
type Slot = Schemas["ViewingSlotDto"];

/** Slots of one mode — a self viewing is booked and moved only to self slots, an accompanied one never to them. */
export function slotsOfMode(slots: readonly Slot[], mode: ViewingMode): Slot[] {
  return slots.filter((slot) => (slot.mode ?? "accompanied") === mode);
}

/** Where the door-code window stands: not yet, open now, or over (D-295 — the API decides; this only words it). */
export function windowPhase(access: Pick<AccessSummary, "validFrom" | "validTo">, now = Date.now()) {
  if (now < Date.parse(access.validFrom)) return "before" as const;
  if (now >= Date.parse(access.validTo)) return "after" as const;
  return "open" as const;
}

/** The access window is still in play (a code may be shown, entry / leaving confirmed). */
export function accessOpen(access: AccessSummary | null): access is AccessSummary {
  return !!access && !access.closedAt && (access.state === "issued" || access.state === "entered");
}

/**
 * The visitor terms as the API returns them (a draft pending legal review, O-024 / O-031): Thai for Thai readers,
 * English for every other language — legal wording is never translated here (like the GL3 disclaimer).
 */
export function termsText(terms: Schemas["VisitorTermsDto"], locale: Locale): string {
  return locale === "th" ? terms.th : terms.en;
}

/** The booking steps still open, in the order the page asks for them (terms are accepted with each booking). */
export function missingSteps(status: Pick<SelfViewingStatus, "identityVerified" | "phoneVerified">) {
  return [
    ...(status.identityVerified ? [] : ["identity" as const]),
    ...(status.phoneVerified ? [] : ["phone" as const]),
  ];
}

/** A return path for the verification page: only this app's self-viewing pages (no open redirect). */
export function safeNext(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  return /^\/rent\/[a-z0-9]+(-[a-z0-9]+)*\/self-viewing$/.test(value) && value.length <= 120 ? value : null;
}

/** Milliseconds until the window closes (to drop a shown code at that moment); never negative. */
export function msUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Date.parse(iso) - now);
}
