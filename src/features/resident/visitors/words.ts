import { formatDate, formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";

import { bangkokDay } from "./model";

/**
 * Dates of the gate as people say them: "6 พ.ย. 09:00 – 18:00" within a day, "6 พ.ย. 09:00 – 8 พ.ย. 18:00" across days.
 */
export function windowText(from: string, to: string, locale: Locale): string {
  const sameDay = bangkokDay(from) === bangkokDay(to);
  const start = `${formatDate(from, locale, { style: "dayMonth" })} ${formatTime(from, locale)}`;
  const end = sameDay
    ? formatTime(to, locale)
    : `${formatDate(to, locale, { style: "dayMonth" })} ${formatTime(to, locale)}`;
  return `${start} – ${end}`;
}

/** "09:12" today, "4 พ.ย. 18:02" another day. */
export function whenText(iso: string, today: string, locale: Locale): string {
  return bangkokDay(iso) === today
    ? formatTime(iso, locale)
    : `${formatDate(iso, locale, { style: "dayMonth" })} ${formatTime(iso, locale)}`;
}
