import { RESIDENT_ENTITLEMENTS, type ResidentEntitlement, type ResidentMe } from "@/lib/api/types";

/**
 * Which resident menus to show: `ResidentMeDto.entitlements` (D-063) — `bills` and `lease` with a lease, `usage`
 * where an IoT meter serves one of my units, `service_requests` / `announcements` / `parcels` where the tenant has
 * the module. Without a unit nothing but home and profile is shown; a value this app has no menu for is ignored.
 */
export type ResidentNavEntitlements = ReadonlySet<ResidentEntitlement>;

export function entitlementsOf(me: Pick<ResidentMe, "entitlements" | "units">): ResidentNavEntitlements {
  if (me.units.length === 0) return new Set();
  return new Set(
    (me.entitlements ?? []).filter((e): e is ResidentEntitlement =>
      (RESIDENT_ENTITLEMENTS as readonly string[]).includes(e),
    ),
  );
}
