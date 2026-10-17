import type { ContractEnum } from "@/lib/api/types";

import { defineStatuses } from "./index";

/**
 * `ParcelStatus` from the contract once B5 parcels (R2) publish it; until then the values of parcel_status (schema-design v2 `ops.parcel.status`). When the
 * generated type appears it replaces the fallback, and a value without a label, tone and icon fails the build.
 * A parcel waiting at the desk is the resident's call to action.
 */
export type ParcelStatus = ContractEnum<"ParcelStatus", "received" | "notified" | "picked_up" | "returned">;

export const PARCEL_STATUS = defineStatuses<ParcelStatus>("parcel", {
  received: { tone: "primary", icon: "parcel" },
  notified: { tone: "info", icon: "announce" },
  picked_up: { tone: "success", icon: "check-circle" },
  returned: { tone: "neutral", icon: "back" },
});
