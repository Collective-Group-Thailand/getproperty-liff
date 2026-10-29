import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { Card } from "@/ui/components/Card";

import { markdownBlocks, shownInEnglishFor, type RecommendationsConsent } from "./model";

/**
 * The `platform.recommendations` text exactly as the API returns it (D-300): its title, the plain-language purpose
 * with the profiling note and its version. Thai for Thai readers, English for everyone else — legal wording is never
 * translated here (O-023: Burmese / Khmer / Lao / Chinese readers read the English text until reviewed translations
 * exist). Markdown becomes text nodes; nothing is injected as HTML.
 */
export async function ConsentText({ consent, locale }: { consent: RecommendationsConsent; locale: Locale }) {
  const t = await getTranslations("recommendations.consent");
  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="recommendations-consent-title"
      data-testid="recommendations-consent"
    >
      <p className="text-muted text-sm">{t("heading")}</p>
      <h2 id="recommendations-consent-title" className="mt-1 text-lg font-semibold" lang={consent.language}>
        {consent.title}
      </h2>
      <div
        className="mt-3 flex flex-col gap-3 text-sm"
        lang={consent.language}
        data-testid="recommendations-consent-body"
      >
        {markdownBlocks(consent.bodyMarkdown).map((runs, index) => (
          <p key={index}>
            {runs.map((run, i) => (run.strong ? <strong key={i}>{run.text}</strong> : <span key={i}>{run.text}</span>))}
          </p>
        ))}
      </div>
      <p className="text-muted mt-3 text-xs" data-testid="recommendations-consent-version">
        {t("version", { version: consent.version })}
      </p>
      {shownInEnglishFor(locale, consent) ? (
        <p className="text-muted mt-1 text-xs" data-testid="recommendations-consent-english">
          {t("english")}
        </p>
      ) : null}
    </Card>
  );
}
