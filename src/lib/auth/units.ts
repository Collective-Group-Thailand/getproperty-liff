import type {
  ResidentEntitlement,
  ResidentMe,
  ResidentMeUnit,
  ResidentUnitCapability,
  ResidentUnitRole,
} from "@/lib/api/types";

/**
 * JRL (D-309, D-322): what a resident is on each unit and what the app shows for it. Pure — the actor, the shell, home
 * and the tests share it.
 *
 * A unit comes from `GET /v1/resident/me/units` (occupancy **or** ownership); `/me` `units` lists occupancies only,
 * so a co-owner who does not live there would otherwise have "no unit".
 */
export type MyUnit = ResidentMeUnit & {
  /** My occupancy's start, else the earliest of my roles on the unit (the greeting's "since"). */
  validFrom: string;
};

export const ALL_CAPABILITIES = [
  "notices",
  "parcels",
  "facilities",
  "rules",
  "contacts",
  "service_requests",
  "invoices",
  "usage",
  "access",
  "lease",
] as const satisfies readonly ResidentUnitCapability[];

/**
 * The menu entitlement each capability opens. The account's entitlements (`/me`, the tenant's modules, D-063) still
 * gate it: a menu shows when the unit allows it **and** the tenant has the module.
 */
const CAPABILITY_OF: Record<ResidentEntitlement, ResidentUnitCapability> = {
  bills: "invoices",
  usage: "usage",
  service_requests: "service_requests",
  lease: "lease",
  announcements: "notices",
  parcels: "parcels",
  facilities: "facilities",
  access: "access",
};

/** The entitlements that hold for this unit: the account's ∩ the unit's capabilities. No unit, no menus. */
export function unitEntitlements(
  entitlements: Iterable<ResidentEntitlement>,
  unit: Pick<ResidentMeUnit, "capabilities"> | null,
): Set<ResidentEntitlement> {
  if (!unit) return new Set();
  const capabilities = new Set(unit.capabilities);
  return new Set([...entitlements].filter((e) => capabilities.has(CAPABILITY_OF[e])));
}

/** Which home the unit gets (JRL): the tenant's of today, the co-owner's, or the household member's. */
export type HomeKind = "resident" | "owner" | "household";

const RESIDING: ReadonlySet<ResidentUnitRole> = new Set(["tenant", "co_tenant", "payer"]);

export function homeKindOf(unit: Pick<ResidentMeUnit, "roles"> | null): HomeKind {
  if (!unit || unit.roles.length === 0) return "resident";
  if (unit.roles.some((r) => RESIDING.has(r.role))) return "resident";
  if (unit.roles.some((r) => r.role === "co_owner")) return "owner";
  return "household";
}

/** The one role word shown for a unit (switcher rows): the strongest role I hold there. */
const ROLE_ORDER: readonly ResidentUnitRole[] = ["co_owner", "tenant", "co_tenant", "payer", "family"];

export function primaryRole(unit: Pick<ResidentMeUnit, "roles">): ResidentUnitRole | null {
  for (const role of ROLE_ORDER) if (unit.roles.some((r) => r.role === role)) return role;
  return null;
}

/** A lease-bound screen (lease, renewal, review, move-out, relocation) for this unit: only as a party of its lease. */
export function leaseAllowed(unit: Pick<ResidentMeUnit, "capabilities" | "leaseIds"> | null, leaseId: string) {
  return Boolean(unit && unit.capabilities.includes("lease") && unit.leaseIds.includes(leaseId));
}

const OCCUPANCY_ROLE: Record<ResidentMe["units"][number]["role"], ResidentUnitRole> = {
  tenant: "tenant",
  co_tenant: "co_tenant",
  owner_occupier: "co_owner",
  family: "family",
  staff: "family",
};

/**
 * `/me/units` joined with my occupancies (the start date). When `/me/units` could not be read, the occupancies of
 * `/me` stand in with every capability — the menus are then the entitlements alone, as before JR (the API still
 * refuses what is not mine).
 */
export function myUnits(me: Pick<ResidentMe, "units">, listed: ResidentMeUnit[] | null): MyUnit[] {
  if (listed === null) {
    return me.units.map((u) => ({
      unitId: u.unitId,
      unitNo: u.unitNo,
      buildingId: u.buildingId,
      buildingName: u.buildingName,
      propertyId: "",
      propertyKind: null,
      legalForm: null,
      areaSqm: null,
      ownershipRatio: null,
      landAreaSqwa: null,
      plotNo: null,
      // Conservative while `/me/units` is unreadable: no auto-pay link, no gate tab (not in ALL_CAPABILITIES).
      recurringAvailable: false,
      tenantId: u.tenantId,
      tenantName: u.tenantName,
      roles: [
        { role: OCCUPANCY_ROLE[u.role], source: "occupancy", partyId: "", leaseId: null, from: u.validFrom, to: null },
      ],
      capabilities: [...ALL_CAPABILITIES],
      leaseIds: [],
      validFrom: u.validFrom,
    }));
  }
  return listed.map((unit) => {
    const occupancy = me.units.find((u) => u.unitId === unit.unitId);
    const earliest = unit.roles.map((r) => r.from).sort()[0];
    return { ...unit, validFrom: occupancy?.validFrom ?? earliest ?? "" };
  });
}

/** The unit on screen: the remembered choice while it is still mine, else the first. */
export function pickUnit(units: MyUnit[], chosen: string | null | undefined): MyUnit | null {
  return units.find((u) => u.unitId === chosen) ?? units[0] ?? null;
}
