import { TIME_ZONE } from "@/i18n/format";

/**
 * `18:00` — the clock time of an instant in Bangkok, 24-hour, Latin digits in every locale (bookings, door-code
 * windows). Local helper: getproperty-web's `format.ts` has `formatDateTime` but no time-only formatter yet.
 */
export function formatClock(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** The server's clock for a render (bookable days, "today" of a technician's list). */
export function currentTime(): number {
  return Date.now();
}
