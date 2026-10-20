import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconWarning } from "@/ui/icons/glyphs/warning";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `BookingStatus` of a facility booking (D-073, D-212) — liff-owned (L4). Waiting for the office's approval is
 * information; a missed booking is a warning to the resident, never danger.
 */
export type BookingStatus = Schemas["BookingStatus"];

export const BOOKING_STATUS = defineStatuses<BookingStatus>("booking", {
  requested: { tone: "info", icon: IconClock },
  confirmed: { tone: "success", icon: IconCheckCircle },
  cancelled: { tone: "neutral", icon: IconXCircle },
  no_show: { tone: "warning", icon: IconWarning },
});
