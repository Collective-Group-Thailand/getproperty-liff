"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ACTIVE_LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { SegmentedControl } from "@/ui/components/SegmentedControl";

const NAMES: Record<(typeof ACTIVE_LOCALES)[number], string> = { th: "ไทย", en: "English" };

/**
 * The resident's language (D-064): written to the API (`PATCH /v1/resident/me`, so LINE messages and documents
 * follow) and to the `gp_locale` cookie (this app). Thai and English now; my/km/lo/zh arrive with L4.
 */
export function LanguagePreference({ current }: { current: Locale }) {
  const t = useTranslations("resident.profile.language");
  const router = useRouter();
  const [value, setValue] = useState<string>(current);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label={t("label")}
        size="lg"
        value={value}
        options={ACTIVE_LOCALES.map((locale) => ({ value: locale, label: NAMES[locale] }))}
        onValueChange={async (next) => {
          const previous = value;
          setValue(next);
          setError(null);
          try {
            unwrap(await browserApi.PATCH("/v1/resident/me", { body: { language: next as Locale } }));
            const secure = window.location.protocol === "https:" ? "; secure" : "";
            document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
            router.refresh();
          } catch (caught) {
            if (!isApiError(caught)) throw caught;
            setValue(previous);
            setError(caught);
          }
        }}
      />
      <p className="text-muted text-sm">{t("hint")}</p>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
