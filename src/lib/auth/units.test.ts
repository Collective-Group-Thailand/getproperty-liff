import { describe, expect, it } from "vitest";

import type { ResidentMeUnit, ResidentUnitRole } from "@/lib/api/types";

import { ALL_CAPABILITIES, homeKindOf, leaseAllowed, myUnits, pickUnit, primaryRole, unitEntitlements } from "./units";

type Role = ResidentMeUnit["roles"][number];

function role(r: ResidentUnitRole, source: Role["source"] = "occupancy", leaseId: string | null = null): Role {
  return { role: r, source, partyId: "p", leaseId, from: "2026-01-01", to: null };
}

function unit(roles: Role[], capabilities: ResidentMeUnit["capabilities"], extra: Partial<ResidentMeUnit> = {}) {
  return {
    unitId: "u1",
    unitNo: "A-201",
    buildingId: "b",
    buildingName: "อาคาร A",
    propertyId: "p",
    tenantId: "t",
    tenantName: "หอพัก",
    roles,
    capabilities,
    leaseIds: [],
    propertyKind: null,
    legalForm: null,
    areaSqm: null,
    ownershipRatio: null,
    landAreaSqwa: null,
    plotNo: null,
    recurringAvailable: false,
    ...extra,
  } satisfies ResidentMeUnit;
}

const EVERY = [
  "bills",
  "usage",
  "service_requests",
  "lease",
  "announcements",
  "parcels",
  "facilities",
  "access",
] as const;
const COMMUNITY = ["notices", "parcels", "facilities", "rules", "contacts", "service_requests"] as const;

describe("role → navigation (JRL, D-322)", () => {
  it("a tenant with a lease and IoT keeps every menu of today", () => {
    const tenant = unit([role("tenant"), role("tenant", "lease", "l1")], [...ALL_CAPABILITIES], { leaseIds: ["l1"] });
    expect([...unitEntitlements(EVERY, tenant)].sort()).toEqual([...EVERY].sort());
    expect(homeKindOf(tenant)).toBe("resident");
  });

  it("a co-owner who does not live there: bills and the community modules, never lease, usage or access", () => {
    const owner = unit([role("co_owner", "ownership")], [...COMMUNITY, "invoices"]);
    expect([...unitEntitlements(EVERY, owner)].sort()).toEqual(
      ["announcements", "bills", "facilities", "parcels", "service_requests"].sort(),
    );
    expect(homeKindOf(owner)).toBe("owner");
    expect(primaryRole(owner)).toBe("co_owner");
  });

  it("a family member: the community modules, usage and access where they live, no bills and no lease", () => {
    const family = unit([role("family")], [...COMMUNITY, "usage", "access"]);
    expect([...unitEntitlements(EVERY, family)].sort()).toEqual(
      ["access", "announcements", "facilities", "parcels", "service_requests", "usage"].sort(),
    );
    expect(homeKindOf(family)).toBe("household");
    expect(primaryRole(family)).toBe("family");
  });

  it("the tenant's modules still gate a capability (no community module → no notices or parcels)", () => {
    const owner = unit([role("co_owner", "ownership")], [...COMMUNITY, "invoices"]);
    expect([...unitEntitlements(["bills"], owner)]).toEqual(["bills"]);
  });

  it("an owner-occupier is a co-owner who lives there; renting a unit you co-own is a tenant's home", () => {
    expect(homeKindOf(unit([role("co_owner", "occupancy")], [...ALL_CAPABILITIES]))).toBe("owner");
    const both = unit([role("co_owner", "ownership"), role("tenant", "lease", "l1")], [...ALL_CAPABILITIES]);
    expect(homeKindOf(both)).toBe("resident");
    expect(primaryRole(both)).toBe("co_owner");
    expect(homeKindOf(unit([role("payer", "lease", "l1")], ["invoices"]))).toBe("resident");
  });

  it("no unit: no menus, today's home", () => {
    expect([...unitEntitlements(EVERY, null)]).toEqual([]);
    expect(homeKindOf(null)).toBe("resident");
  });

  it("ignores an entitlement this app has no menu for", () => {
    expect([...unitEntitlements(["bills", "admin" as never], unit([role("tenant")], [...ALL_CAPABILITIES]))]).toEqual([
      "bills",
    ]);
  });

  it("a lease-bound screen only on a unit whose lease I am a party of", () => {
    const tenant = unit([role("tenant", "lease", "l1")], [...ALL_CAPABILITIES], { leaseIds: ["l1"] });
    expect(leaseAllowed(tenant, "l1")).toBe(true);
    expect(leaseAllowed(tenant, "l2")).toBe(false);
    expect(leaseAllowed(unit([role("co_owner", "ownership")], [...COMMUNITY, "invoices"]), "l1")).toBe(false);
    expect(leaseAllowed(null, "l1")).toBe(false);
  });
});

describe("my units", () => {
  const occupancy = {
    unitId: "u1",
    unitNo: "A-201",
    buildingId: "b",
    buildingName: "อาคาร A",
    tenantId: "t",
    tenantName: "หอพัก",
    role: "family" as const,
    validFrom: "2026-03-01",
  };

  it("joins /me/units with my occupancy's start; an owned unit starts with its earliest role", () => {
    const owned = unit([{ ...role("co_owner", "ownership"), from: "2025-05-01" }], [...COMMUNITY], { unitId: "u2" });
    const listed = [unit([role("family")], [...COMMUNITY]), owned];
    const units = myUnits({ units: [occupancy] }, listed);
    expect(units.map((u) => [u.unitId, u.validFrom])).toEqual([
      ["u1", "2026-03-01"],
      ["u2", "2025-05-01"],
    ]);
  });

  it("falls back to /me occupancies with every capability when /me/units could not be read", () => {
    const units = myUnits({ units: [occupancy] }, null);
    expect(units).toHaveLength(1);
    expect(units[0]!.capabilities).toEqual([...ALL_CAPABILITIES]);
    expect(units[0]!.roles[0]).toMatchObject({ role: "family", source: "occupancy" });
  });

  it("picks the remembered unit while it is still mine, else the first", () => {
    const units = myUnits({ units: [] }, [unit([], []), unit([], [], { unitId: "u2" })]);
    expect(pickUnit(units, "u2")?.unitId).toBe("u2");
    expect(pickUnit(units, "gone")?.unitId).toBe("u1");
    expect(pickUnit(units, undefined)?.unitId).toBe("u1");
    expect(pickUnit([], "u1")).toBeNull();
  });
});
