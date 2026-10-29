import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { RELOCATION_STATUS } from "@/domain/status/growth";
import { loadLeases, pageLocale } from "@/features/resident/lease/data";
import { loadRelocationOffers, loadRelocationPurpose } from "@/features/resident/relocation/data";
import { consentLanguage, englishForOthers, purposeState, sortOffers } from "@/features/resident/relocation/model";
import { RelocationConsentForm } from "@/features/resident/relocation/RelocationConsentForm";
import { RelocationStop } from "@/features/resident/relocation/RelocationStop";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { PurposeText } from "@/features/shared/consent/PurposeText";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { formatDate, formatTHB } from "@/i18n/format";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconChat } from "@/ui/icons/glyphs/chat";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconSearch } from "@/ui/icons/glyphs/search";
import { IconShield } from "@/ui/icons/glyphs/shield";

export async function generateMetadata() {
  const t = await getTranslations("resident.relocation");
  return { title: t("title") };
}

/**
 * Relocation help (GL4, api G8, D-299): Collective's own optional purpose `resident.relocation` — its text as the API
 * returns it, a box never pre-ticked, stop in one tap — and my offers (one per lease under notice while it is on).
 */
export default async function RelocationPage({
  searchParams,
}: {
  searchParams: Promise<{ on?: string; stopped?: string }>;
}) {
  const [t, status, locale, params] = await Promise.all([
    getTranslations("resident.relocation"),
    getTranslations(),
    pageLocale(),
    searchParams,
  ]);
  const [purpose, offers, leases] = await Promise.all([
    loadRelocationPurpose(locale),
    loadRelocationOffers(),
    loadLeases(),
  ]);
  const failure = purpose.error ?? offers.error;
  if (failure) {
    return (
      <ResidentShell active={null}>
        <BackLink href="/">{t("back.home")}</BackLink>
        <ProblemPage error={failure} />
      </ResidentShell>
    );
  }
  const language = consentLanguage(locale);
  const text = purpose.data;
  const on = offers.data!.consented;
  const state = text ? purposeState(text) : "off";
  const sorted = sortOffers(offers.data!.data);
  const underNotice = (leases.data ?? []).some((lease) => lease.notice !== null);
  const date = (value: string) => formatDate(value, locale, { style: "long" });

  return (
    <ResidentShell active={null}>
      <BackLink href="/">{t("back.home")}</BackLink>
      <div className="flex flex-col gap-5 py-5" data-testid="relocation-page" data-on={on}>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("lead")}</p>
        </div>

        {params.on === "1" && on ? (
          <div role="status" data-testid="relocation-on">
            <Callout tone="success" icon={IconCheckCircle} title={t("status.onTitle")}>
              {t("status.onBody")}
            </Callout>
          </div>
        ) : null}
        {params.stopped === "1" && !on ? (
          <div role="status" data-testid="relocation-stopped">
            <Callout tone="success" icon={IconCheckCircle} title={t("status.stoppedTitle")}>
              {t("status.stoppedBody")}
            </Callout>
          </div>
        ) : null}

        {on && text ? (
          <Card as="section" padding="md" aria-labelledby="relocation-status-title" data-testid="relocation-status">
            <h2 id="relocation-status-title" className="font-semibold">
              {t("status.title")}
            </h2>
            <p className="text-muted mt-1 text-sm">
              {text.capturedAt
                ? t("status.since", { date: date(text.capturedAt), version: text.version })
                : t("status.onShort")}
            </p>
            <p className="mt-2 text-sm">{t("status.privacy")}</p>
            <div className="mt-3">
              <RelocationStop version={text.version} language={language} />
            </div>
          </Card>
        ) : text ? (
          <>
            <Card as="section" padding="md" aria-labelledby="relocation-how-title" data-testid="relocation-how">
              <h2 id="relocation-how-title" className="font-semibold">
                {t("how.title")}
              </h2>
              <ul className="mt-3 flex flex-col gap-3" role="list">
                {(
                  [
                    [IconSearch, "how.where"],
                    [IconShield, "how.private"],
                    [IconChat, "how.record"],
                  ] as const
                ).map(([icon, key]) => (
                  <li key={key} className="flex gap-3 text-sm">
                    <Icon icon={icon} className="text-primary mt-0.5 shrink-0" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <section className="flex flex-col gap-3" aria-labelledby="relocation-consent-heading">
              <h2 id="relocation-consent-heading" className="text-lg font-semibold">
                {state === "outdated" ? t("consent.changedTitle") : t("consent.title")}
              </h2>
              <p className="text-muted text-sm">{t("consent.lead")}</p>
              <PurposeText
                title={text.title}
                bodyMarkdown={text.bodyMarkdown}
                language={language}
                heading={t("consent.heading")}
                versionLabel={t("consent.version", { version: text.version })}
                englishNote={englishForOthers(locale) ? t("consent.english") : null}
                testId="relocation-consent"
              />
              <RelocationConsentForm version={text.version} language={language} />
            </section>
          </>
        ) : (
          <Callout tone="neutral" title={t("unavailable.title")}>
            {t("unavailable.body")}
          </Callout>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="relocation-offers-title">
          <h2 id="relocation-offers-title" className="text-lg font-semibold">
            {t("offers.title")}
          </h2>
          {sorted.length === 0 ? (
            <div data-testid="relocation-offers-empty">
              <EmptyState
                icon={IconSearch}
                title={on && underNotice ? t("offers.preparingTitle") : t("offers.emptyTitle")}
                description={
                  on && underNotice
                    ? t("offers.preparingBody")
                    : on
                      ? t("offers.emptyOnBody")
                      : t("offers.emptyOffBody")
                }
              />
            </div>
          ) : (
            <ul className="flex flex-col gap-3" role="list" data-testid="relocation-offers">
              {sorted.map((offer) => {
                const meta = RELOCATION_STATUS[offer.state];
                return (
                  <li key={offer.id}>
                    <Link
                      href={`/relocation/${offer.id}`}
                      className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-4"
                      data-testid="relocation-offer-link"
                      data-state={offer.state}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{t("offers.unit", { unit: offer.unitNo })}</span>
                          <StatusBadge status={meta} label={status(meta.labelKey)} size="sm" />
                        </span>
                        <span className="text-muted text-sm">
                          {offer.moveOutDate
                            ? t("offers.moveOut", { landlord: offer.landlordName, date: date(offer.moveOutDate) })
                            : offer.landlordName}
                        </span>
                        {offer.destination ? (
                          <span className="text-sm">
                            {offer.destination.maxRent
                              ? t("offers.destinationBudget", {
                                  count: offer.listings.length,
                                  budget: formatTHB(offer.destination.maxRent, locale, { decimals: 0 }),
                                })
                              : t("offers.destination", { count: offer.listings.length })}
                          </span>
                        ) : offer.state === "open" ? (
                          <span className="text-primary text-sm font-medium">{t("offers.whereTo")}</span>
                        ) : null}
                      </span>
                      <Icon icon={IconForward} className="text-muted shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-muted text-xs">
          {t("footnote")}{" "}
          <Link href="/profile/privacy" className="text-primary underline">
            {t("privacyLink")}
          </Link>
        </p>
      </div>
    </ResidentShell>
  );
}
