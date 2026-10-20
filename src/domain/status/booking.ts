import type { Schemas } from "@/lib/api/types";
import { IconCalendarCheck } from "@/ui/icons/glyphs/calendar-check";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconFlag } from "@/ui/icons/glyphs/flag";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `BookingStatus` of a facility booking (B5.3, D-073, D-212) — liff-owned (L4), with the tones and icons of
 * getproperty-web `7f6030b` `src/domain/status/booking.ts` so both apps show a booking the same way.
 */
export type BookingStatus = Schemas["BookingStatus"];

export const BOOKING_STATUS = defineStatuses<BookingStatus>("booking", {
  requested: { tone: "warning", icon: IconClock },
  confirmed: { tone: "success", icon: IconCalendarCheck },
  cancelled: { tone: "neutral", icon: IconXCircle },
  no_show: { tone: "neutral", icon: IconFlag },
});
