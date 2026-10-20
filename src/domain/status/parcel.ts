import type { ContractEnum } from "@/lib/api/types";
import { IconAnnounce } from "@/ui/icons/glyphs/announce";
import { IconBack } from "@/ui/icons/glyphs/back";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconParcel } from "@/ui/icons/glyphs/parcel";

import { defineStatuses } from "./index";

/**
 * `ParcelStatus` — a contract enum since B5 (D-210, D-212); the fallback only types it when no contract is generated.
 * A value the contract adds fails the build until it has a label, a tone and an icon.
 * A parcel waiting at the desk is the resident's call to action.
 */
export type ParcelStatus = ContractEnum<"ParcelStatus", "received" | "notified" | "picked_up" | "returned">;

export const PARCEL_STATUS = defineStatuses<ParcelStatus>("parcel", {
  received: { tone: "primary", icon: IconParcel },
  notified: { tone: "info", icon: IconAnnounce },
  picked_up: { tone: "success", icon: IconCheckCircle },
  returned: { tone: "neutral", icon: IconBack },
});
