import { RESIDENT_ENTITLEMENTS, type ResidentEntitlement, type ResidentMe } from "@/lib/api/types";

/**
 * Which resident menus to show. CONTRACT-REQUEST #2: `ResidentMeDto.entitlements` is not in the contract yet
 * (docs/contract-requests.md). Until it is, the conservative default applies: bills only — every resident with
 * an occupancy is billed (D-011); usage needs IoT meters (D-063), lease documents arrive with B2.3, service
 * requests/announcements/parcels are R2 — none of which this app can know without the API saying so.
 */
export const DEFAULT_ENTITLEMENTS: readonly ResidentEntitlement[] = ["bills"];

export type ResidentNavEntitlements = ReadonlySet<ResidentEntitlement>;

export function entitlementsOf(me: Pick<ResidentMe, "entitlements" | "units">): ResidentNavEntitlements {
  if (me.units.length === 0) return new Set();
  const listed = Array.isArray(me.entitlements) ? me.entitlements : DEFAULT_ENTITLEMENTS;
  return new Set(
    listed.filter((e): e is ResidentEntitlement => (RESIDENT_ENTITLEMENTS as readonly string[]).includes(e)),
  );
}
