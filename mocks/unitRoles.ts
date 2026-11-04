/**
 * JRL (D-309, D-322): the resident's units and roles in the mock, as `GET /v1/resident/me/units` and `/me` `unitRoles`
 * compute them in the API (`src/core/identity/resident-units.ts`): ownership → `co_owner`; occupancy → tenant /
 * co_tenant / family / co_owner (owner-occupier); a lease in force on an occupied or owned unit → its lease roles
 * (context only — a lease alone never adds a unit). Capabilities per unit follow D-322.
 */
import { createHash } from "node:crypto";

import type { components } from "../src/lib/api/schema";
import { residenceOf } from "./residence";
import type { MockAccount, MockSession } from "./state";

type Schemas = components["schemas"];
type MeUnit = Schemas["ResidentMeUnitDto"];
type Role = Schemas["ResidentUnitRoleDto"];

const IN_FORCE = new Set(["active", "notice_given", "ending"]);
const OCCUPANCY: Record<Schemas["OccupancyRole"], Schemas["ResidentUnitRole"]> = {
  tenant: "tenant",
  co_tenant: "co_tenant",
  owner_occupier: "co_owner",
  family: "family",
  staff: "family",
};

/** A stable party id per account and unit (the mock does not model parties). */
function partyId(account: MockAccount, unitId: string): string {
  const hex = createHash("sha256").update(`${account.subject}#party#${unitId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function myUnitsOf(account: MockAccount): MeUnit[] {
  const leases = residenceOf(account).leases.filter(({ dto }) => IN_FORCE.has(dto.status));
  const out: MeUnit[] = [];
  const add = (base: Omit<MeUnit, "roles" | "capabilities" | "leaseIds">, roles: Role[]) => {
    const existing = out.find((u) => u.unitId === base.unitId);
    if (existing) existing.roles.push(...roles);
    else out.push({ ...base, roles, capabilities: [], leaseIds: [] });
  };
  for (const u of account.units) {
    add(
      {
        unitId: u.unitId,
        unitNo: u.unitNo,
        buildingId: u.buildingId,
        buildingName: u.buildingName,
        // The mock has no property; the building id stands in.
        propertyId: u.buildingId,
        tenantId: u.tenantId,
        tenantName: u.tenantName,
      },
      [
        {
          role: OCCUPANCY[u.role],
          source: "occupancy",
          partyId: partyId(account, u.unitId),
          leaseId: null,
          from: u.validFrom,
          to: null,
        },
      ],
    );
  }
  for (const o of account.owned) {
    const { from, ...base } = o;
    add(base, [
      { role: "co_owner", source: "ownership", partyId: partyId(account, o.unitId), leaseId: null, from, to: null },
    ]);
  }
  for (const unit of out) {
    for (const { dto } of leases) {
      if (dto.unitNo !== unit.unitNo || dto.tenantId !== unit.tenantId) continue;
      unit.roles.push({
        role: "tenant",
        source: "lease",
        partyId: partyId(account, unit.unitId),
        leaseId: dto.id,
        from: dto.startDate,
        to: dto.endDate,
      });
      unit.leaseIds.push(dto.id);
    }
    unit.capabilities = capabilitiesOf(unit);
  }
  return out;
}

/** D-322: every role → the community six; bills unless family only; usage / access where I live; lease as its party. */
export function capabilitiesOf(unit: Pick<MeUnit, "roles">): Schemas["ResidentUnitCapability"][] {
  const caps: Schemas["ResidentUnitCapability"][] = [
    "notices",
    "parcels",
    "facilities",
    "rules",
    "contacts",
    "service_requests",
  ];
  if (unit.roles.some((r) => r.role !== "family")) caps.push("invoices");
  if (unit.roles.some((r) => r.source === "occupancy")) caps.push("usage", "access");
  if (unit.roles.some((r) => r.source === "lease")) caps.push("lease");
  return caps;
}

export function unitsHash(units: MeUnit[]): string {
  const keys = units.flatMap((u) => u.roles.map((r) => `${u.unitId}:${r.role}:${r.source}`)).sort();
  return createHash("sha256").update(keys.join("|")).digest("hex");
}

/** `unit:` scopes the API puts in a token: units I live in or own (JR). */
export function scopeUnitIds(account: MockAccount): string[] {
  return [...new Set([...account.units.map((u) => u.unitId), ...account.owned.map((o) => o.unitId)])];
}

export function meUnits(account: MockAccount, session?: MockSession): Schemas["ResidentMeUnitsDto"] {
  const units = myUnitsOf(account);
  const held = new Set((session?.scopes ?? []).filter((s) => s.startsWith("unit:")).map((s) => s.slice(5)));
  const today = new Set(scopeUnitIds(account));
  const refreshRequired =
    session?.scopes != null && (held.size !== today.size || [...today].some((id) => !held.has(id)));
  return { units, unitsHash: unitsHash(units), refreshRequired };
}

/** `/me` `unitRoles`: the same roles flattened with their unit. */
export function unitRolesOf(account: MockAccount): Schemas["ResidentUnitRoleRefDto"][] {
  return myUnitsOf(account).flatMap((u) =>
    u.roles.map((r) => ({
      unitId: u.unitId,
      buildingId: u.buildingId,
      propertyId: u.propertyId,
      tenantId: u.tenantId,
      role: r.role,
      source: r.source,
      from: r.from,
      to: r.to,
    })),
  );
}
