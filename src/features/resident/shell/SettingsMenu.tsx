"use client";

import { useRouter } from "next/navigation";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/i18n/routing";
import { browserApi } from "@/lib/api/browser";

import { SettingsMenuView } from "./SettingsMenuView";

/** Writes `gp_locale`, tells the API (signed in), and re-renders in the new language. */
export function SettingsMenu({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const router = useRouter();
  return (
    <SettingsMenuView
      locale={locale}
      signedIn={signedIn}
      onLanguage={async (next) => {
        const secure = window.location.protocol === "https:" ? "; secure" : "";
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
        if (signedIn) {
          // `PATCH /v1/resident/me` (D-064): LINE messages and documents follow. The cookie is already written, so a
          // failure here only means the API keeps the old language for LINE messages.
          await browserApi.PATCH("/v1/resident/me", { body: { language: next } }).catch(() => undefined);
        }
        router.refresh();
      }}
      onSignOut={async () => {
        // Loaded on demand: sign-out is rare and the shell is at its JS budget (D-179).
        const { signOut } = await import("@/lib/auth/signOut");
        await signOut();
        router.replace("/signed-out");
        router.refresh();
      }}
    />
  );
}
