"use client";

import { useRouter } from "next/navigation";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/i18n/routing";
import { bffJson } from "@/lib/api/browser";
import { signOut } from "@/lib/auth/client";

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
          // CONTRACT-REQUEST #3: PATCH /v1/resident/me { language } is not in the contract yet. The cookie is
          // already written, so a failure here only means the API keeps the old language for LINE messages.
          await bffJson("/v1/resident/me", { method: "PATCH", body: { language: next } }).catch(() => undefined);
        }
        router.refresh();
      }}
      onSignOut={async () => {
        await signOut();
        router.replace("/signed-out");
        router.refresh();
      }}
    />
  );
}
