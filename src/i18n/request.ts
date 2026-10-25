import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { loadMessages } from "./messages";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./routing";

/**
 * One zone, no locale segment: the locale comes from the `gp_locale` cookie (set by the switcher or,
 * on first open, from `liff.getLanguage()`), Thai by default. Every date the API returns is rendered in
 * Bangkok time, wherever the resident is (CLAUDE.md). The technician namespace is loaded too — it is
 * small, and L4 splits it per route when the technician screens exist.
 */
export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  return {
    locale,
    timeZone: "Asia/Bangkok",
    messages: await loadMessages(locale, ["shared", "resident", "technician", "prospect"]),
  };
});
