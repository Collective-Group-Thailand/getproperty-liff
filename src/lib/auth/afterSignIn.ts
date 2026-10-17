"use client";

import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/routing";
import { browserApi } from "@/lib/api/browser";
import { safeInternalPath } from "@/lib/liff/deepLink";

import { consentPath } from "./redirects";

/**
 * Right after a sign-in (LIFF exchange or SMS code): the resident's language from `/v1/resident/me` wins over
 * whatever the cookie said (L1 1.2 §6) — written once here, then the switcher keeps cookie and API in step — and
 * a resident whose required consents are missing goes to the consent screen first (D-025). Returns where to go.
 */
export async function afterResidentSignIn(target: string): Promise<string> {
  const next = safeInternalPath(target);
  const { data } = await browserApi.GET("/v1/resident/me");
  if (!data) return next;
  if (isLocale(data.user.language)) {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${data.user.language}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
  }
  // Consent comes first, invitation links included: `POST /v1/resident/link` refuses with `consent.required`
  // until the required purposes are granted (D-025, D-061).
  if (!data.consentComplete && !next.startsWith("/consent")) return consentPath(next);
  return next;
}
