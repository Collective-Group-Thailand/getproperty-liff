"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES, type Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Field } from "@/ui/components/Field";
import { NativeSelect } from "@/ui/components/NativeSelect";

/**
 * The resident's language (D-064): written to the API (`PATCH /v1/resident/me`, so LINE messages and documents
 * follow) and to the `gp_locale` cookie (this app). All six languages (L4), each named in its own script; a native
 * select, so six long names never overflow a 360-px screen.
 */
export function LanguagePreference({ current }: { current: Locale }) {
  const t = useTranslations("resident.profile.language");
  const names = useTranslations("shell.languageNames");
  const router = useRouter();
  const [value, setValue] = useState<string>(current);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Field label={t("label")} hint={t("hint")}>
        <NativeSelect
          value={value}
          inputSize="lg"
          options={LOCALES.map((locale) => ({ value: locale, label: names(locale) }))}
          data-testid="profile-language"
          onChange={async (event) => {
            const next = event.target.value;
            const previous = value;
            setValue(next);
            setError(null);
            try {
              unwrap(await browserApi.PATCH("/v1/resident/me", { body: { language: next as Locale } }));
              const secure = window.location.protocol === "https:" ? "; secure" : "";
              document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
              router.refresh();
            } catch (caught) {
              setValue(previous);
              setError(toApiError(caught));
            }
          }}
        />
      </Field>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
