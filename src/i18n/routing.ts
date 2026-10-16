/**
 * Resident locales (D-064). Thai is the default and English is complete in R1; Myanmar, Khmer, Lao and
 * Chinese are scaffolded now (empty message files that fall back to English, `messages.ts`) and filled
 * in L4 (R2) together with their font subsets.
 *
 * There is no locale segment in the URL: a LIFF endpoint URL is fixed in the LINE Developers console
 * and deep links carry `liff.state`, so the locale lives in the `gp_locale` cookie — written by the
 * language switcher, or on first open from `liff.getLanguage()` (`src/lib/liff`); L1 also syncs it
 * with `/v1/resident/me.language`.
 */
export const LOCALES = ["th", "en", "my", "km", "lo", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

/** Locales whose copy is complete today; the others render English until L4. */
export const ACTIVE_LOCALES = ["th", "en"] as const satisfies readonly Locale[];
export const DEFAULT_LOCALE: Locale = "th";
export const FALLBACK_LOCALE: Locale = "en";

/** JS-readable on purpose, like `gp_theme`: it carries no identity and the switcher writes it without a round trip. */
export const LOCALE_COOKIE = "gp_locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Maps a BCP-47 tag (`liff.getLanguage()` returns e.g. `th`, `en-US`, `zh-TW`, `my-MM`) onto a
 * supported locale, or the default.
 */
export function localeFromLanguageTag(tag: string | null | undefined): Locale {
  const primary = (tag ?? "").toLowerCase().split(/[-_]/)[0] ?? "";
  return isLocale(primary) ? primary : DEFAULT_LOCALE;
}
