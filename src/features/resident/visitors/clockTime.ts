import { useTranslations } from "next-intl";

import { formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";

/** "22:41 น." — the time of day in the reader's words. */
export function useClockTime(locale: Locale) {
  const t = useTranslations("resident.visitors");
  return (iso: string | null | undefined) => (iso ? t("time", { time: formatTime(iso, locale) }) : "");
}
