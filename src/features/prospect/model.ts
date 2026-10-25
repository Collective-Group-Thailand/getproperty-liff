import type { Schemas } from "@/lib/api/types";

export type Enquiry = Schemas["ProspectEnquiryDto"];
export type Viewing = Schemas["LeadViewingDto"];
export type Slot = Schemas["ViewingSlotDto"];
export type PublicListing = Schemas["PublicListingDetailDto"];

const LIVE = new Set<Viewing["state"]>(["requested", "confirmed"]);

/** The viewing still to come (requested or confirmed), if any. */
export function liveViewing(enquiry: Pick<Enquiry, "viewings">): Viewing | null {
  return (
    [...enquiry.viewings].filter((v) => LIVE.has(v.state)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ??
    null
  );
}

/** Slots grouped by their Bangkok day (`YYYY-MM-DD`), in time order. */
export function slotsByDay(slots: Slot[]): { day: string; slots: Slot[] }[] {
  const days = new Map<string, Slot[]>();
  for (const slot of slots) {
    const day = new Date(Date.parse(slot.startsAt) + 7 * 3_600_000).toISOString().slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), slot]);
  }
  return [...days.entries()].map(([day, list]) => ({ day, slots: list }));
}

/** Open enquiries first (most recently active), then the closed ones. */
export function sortEnquiries(list: Enquiry[]): { open: Enquiry[]; closed: Enquiry[] } {
  const byUpdate = (a: Enquiry, b: Enquiry) => b.updatedAt.localeCompare(a.updatedAt);
  return { open: list.filter((e) => e.open).sort(byUpdate), closed: list.filter((e) => !e.open).sort(byUpdate) };
}

/** A maps search for the listing's public address (opened outside LINE). */
export function directionsUrl(address: string | null, geo: { lat: number; lng: number } | null): string | null {
  if (geo) return `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}`;
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return null;
}
