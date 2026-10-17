import type { ContractEnum } from "@/lib/api/types";
import { IconAnnounce } from "@/ui/icons/glyphs/announce";
import { IconBack } from "@/ui/icons/glyphs/back";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconParcel } from "@/ui/icons/glyphs/parcel";

import { defineStatuses } from "./index";

/**
 * `ParcelStatus` from the contract once B5 parcels (R2) publish it; until then the values of parcel_status (schema-design v2 `ops.parcel.status`). When the
 * generated type appears it replaces the fallback, and a value without a label, tone and icon fails the build.
 * A parcel waiting at the desk is the resident's call to action.
 */
export type ParcelStatus = ContractEnum<"ParcelStatus", "received" | "notified" | "picked_up" | "returned">;

export const PARCEL_STATUS = defineStatuses<ParcelStatus>("parcel", {
  received: { tone: "primary", icon: IconParcel },
  notified: { tone: "info", icon: IconAnnounce },
  picked_up: { tone: "success", icon: IconCheckCircle },
  returned: { tone: "neutral", icon: IconBack },
});
