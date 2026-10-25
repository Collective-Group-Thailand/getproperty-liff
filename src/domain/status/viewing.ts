import type { ContractEnum } from "@/lib/api/types";
import { IconCalendarCheck } from "@/ui/icons/glyphs/calendar-check";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/** `ListingViewingState` — a viewing a prospect booked, as the prospect reads it (L5, D-252). */
export type ViewingState = ContractEnum<
  "ListingViewingState",
  "requested" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show"
>;

export const VIEWING_STATUS = defineStatuses<ViewingState>("listingViewing", {
  requested: { tone: "warning", icon: IconClock },
  confirmed: { tone: "success", icon: IconCalendarCheck },
  declined: { tone: "neutral", icon: IconXCircle },
  cancelled: { tone: "neutral", icon: IconXCircle },
  completed: { tone: "success", icon: IconCheckCircle },
  no_show: { tone: "neutral", icon: IconXCircle },
});
