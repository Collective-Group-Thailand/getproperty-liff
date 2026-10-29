import { getTranslations } from "next-intl/server";

import { loadLease, pageLocale } from "@/features/resident/lease/data";
import { consentLanguage, englishForOthers } from "@/features/resident/relocation/model";
import { loadReview } from "@/features/resident/reviews/data";
import { LazyReviewForm } from "@/features/resident/reviews/LazyReviewForm";
import { reviewEntry } from "@/features/resident/reviews/model";
import { MyReviewCard } from "@/features/resident/reviews/MyReviewCard";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { PurposeText } from "@/features/shared/consent/PurposeText";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { formatDate, formatPeriodKey } from "@/i18n/format";
import { Callout } from "@/ui/components/Callout";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";

export async function generateMetadata() {
  const t = await getTranslations("resident.reviews");
  return { title: t("metaTitle") };
}

/**
 * Reviewing the building of one of my leases (GL4, api G9, D-301): verified tenure only (after moving out, or after
 * `review.min_tenure_months` — the API says from when), the `review.publish` text as returned (th / en) with a box never
 * pre-ticked, pre-moderation by the getproperty team (O-035), my review's state and withdrawal.
 */
export default async function LeaseReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ leaseId: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const [{ leaseId }, query] = await Promise.all([params, searchParams]);
  const [t, locale] = await Promise.all([getTranslations("resident.reviews"), pageLocale()]);
  const [lease, view] = await Promise.all([loadLease(leaseId), loadReview(leaseId, locale)]);
  const back = <BackLink href={`/lease/${leaseId}`}>{t("back")}</BackLink>;
  const failure = lease.error ?? view.error;
  if (failure) {
    return (
      <ResidentShell active={null}>
        {back}
        <ProblemPage error={failure} />
      </ResidentShell>
    );
  }
  const data = view.data!;
  const entry = reviewEntry(data);
  const tenure = data.eligibility.tenure;
  const months = (key: string) => formatPeriodKey(key, locale);

  return (
    <ResidentShell active={null}>
      {back}
      <div className="flex flex-col gap-5 py-5" data-testid="review-page" data-kind={entry.kind}>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{t("title", { building: lease.data!.buildingName })}</h1>
          <p className="text-muted">{t("lead")}</p>
          {tenure ? (
            <p className="text-sm" data-testid="review-tenure">
              {tenure.to
                ? t("tenure", { from: months(tenure.from), to: months(tenure.to) })
                : t("tenureNow", { from: months(tenure.from) })}
            </p>
          ) : null}
        </div>

        {query.sent === "1" && entry.kind === "mine" ? (
          <div role="status" data-testid="review-sent">
            <Callout tone="success" icon={IconCheckCircle} title={t("sent.title")}>
              {t("sent.body")}
            </Callout>
          </div>
        ) : null}

        {entry.kind === "mine" ? (
          <MyReviewCard review={entry.review} leaseId={leaseId} locale={locale} />
        ) : entry.kind === "wait" ? (
          <div data-testid="review-too-early">
            <Callout tone="info" icon={IconClock} title={t("tooEarly.title")}>
              {entry.from
                ? t("tooEarly.body", { date: formatDate(entry.from, locale, { style: "long" }) })
                : t("tooEarly.bodyNoDate")}
            </Callout>
          </div>
        ) : entry.kind === "none" ? (
          <div data-testid="review-unavailable" data-reason={entry.reason ?? undefined}>
            <Callout tone="neutral" title={t(`unavailable.${entry.reason ?? "not_started"}.title`)}>
              {t(`unavailable.${entry.reason ?? "not_started"}.body`)}
            </Callout>
          </div>
        ) : data.consent ? (
          <LazyReviewForm
            leaseId={leaseId}
            consentVersion={data.consent.version}
            locale={locale}
            consentText={
              <PurposeText
                title={data.consent.title}
                bodyMarkdown={data.consent.bodyMarkdown}
                language={consentLanguage(locale)}
                heading={t("consent.heading")}
                versionLabel={t("consent.version", { version: data.consent.version })}
                englishNote={englishForOthers(locale) ? t("consent.english") : null}
                testId="review-consent-text"
              />
            }
          />
        ) : (
          <Callout tone="neutral" title={t("noConsent.title")}>
            {t("noConsent.body")}
          </Callout>
        )}
      </div>
    </ResidentShell>
  );
}
