import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { RELOCATION_STATUS } from "@/domain/status/growth";
import { pageLocale } from "@/features/resident/lease/data";
import { loadRelocationOffers, loadRentRecord } from "@/features/resident/relocation/data";
import { DismissOffer } from "@/features/resident/relocation/DismissOffer";
import { LazyDestinationForm } from "@/features/resident/relocation/LazyDestinationForm";
import { destinationLabel } from "@/features/resident/relocation/model";
import { OfferListings } from "@/features/resident/relocation/OfferListings";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { loadAreas } from "@/features/shared/recommendations/data";
import { formatDate, formatTHB } from "@/i18n/format";
import { Button } from "@/ui/components/Button";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconSearch } from "@/ui/icons/glyphs/search";

export async function generateMetadata() {
  const t = await getTranslations("resident.relocation.offer");
  return { title: t("metaTitle") };
}

/**
 * One relocation offer (D-299) — the target of the LINE message `relocation.offer_ready`: where I am moving to and my
 * budget, the public listings there, *Ask the owner* (with my rent record only when I tick it), *no more suggestions*.
 * A closed offer reads only; when the consent is gone the page says so and links back to turn it on.
 */
export default async function RelocationOfferPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const [t, status, locale, offers, areas, record] = await Promise.all([
    getTranslations("resident.relocation"),
    getTranslations(),
    pageLocale(),
    loadRelocationOffers(),
    loadAreas(),
    loadRentRecord(),
  ]);
  const back = <BackLink href="/relocation">{t("back.relocation")}</BackLink>;
  if (offers.error) {
    return (
      <ResidentShell active={null}>
        {back}
        <ProblemPage error={offers.error} />
      </ResidentShell>
    );
  }
  const offer = offers.data.data.find((o) => o.id === offerId);
  if (!offer) {
    return (
      <ResidentShell active={null}>
        {back}
        <div className="py-6" data-testid="relocation-offer-missing">
          <EmptyState
            icon={IconSearch}
            title={t("offer.missingTitle")}
            description={t("offer.missingBody")}
            action={
              <Button asChild size="lg">
                <Link href="/relocation">{t("back.relocation")}</Link>
              </Button>
            }
          />
        </div>
      </ResidentShell>
    );
  }
  const consented = offers.data.consented;
  const open = offer.state === "open" && consented;
  const meta = RELOCATION_STATUS[offer.state];
  const shareable = record && record.months.length > 0 ? record : null;

  return (
    <ResidentShell active={null}>
      {back}
      <div className="flex flex-col gap-5 py-5" data-testid="relocation-offer" data-state={offer.state}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-semibold">{t("offer.title")}</h1>
            <StatusBadge status={meta} label={status(meta.labelKey)} />
          </div>
          <p className="text-muted text-sm">
            {offer.moveOutDate
              ? t("offer.leaving", {
                  unit: offer.unitNo,
                  landlord: offer.landlordName,
                  date: formatDate(offer.moveOutDate, locale, { style: "long" }),
                })
              : t("offer.leavingNoDate", { unit: offer.unitNo, landlord: offer.landlordName })}
          </p>
        </div>

        {!consented ? (
          <Callout
            tone="neutral"
            title={t("offer.offTitle")}
            action={
              <Button asChild size="lg" block>
                <Link href="/relocation" data-testid="relocation-offer-turn-on">
                  {t("offer.offCta")}
                </Link>
              </Button>
            }
          >
            {t("offer.offBody")}
          </Callout>
        ) : offer.state !== "open" ? (
          <Callout tone="neutral" title={t(`offer.closed.${offer.state}.title`)}>
            {t(`offer.closed.${offer.state}.body`)}
          </Callout>
        ) : null}

        {open ? (
          <>
            <Card
              as="section"
              padding="md"
              aria-labelledby="relocation-destination-title"
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1">
                <h2 id="relocation-destination-title" className="text-lg font-semibold">
                  {t("destination.title")}
                </h2>
                {offer.destination ? (
                  <p className="text-sm" data-testid="relocation-destination-current">
                    {offer.destination.maxRent
                      ? t("destination.currentBudget", {
                          place: destinationLabel(offer.destination, areas, locale),
                          budget: formatTHB(offer.destination.maxRent, locale, { decimals: 0 }),
                        })
                      : t("destination.current", { place: destinationLabel(offer.destination, areas, locale) })}
                  </p>
                ) : (
                  <p className="text-muted text-sm">{t("destination.lead")}</p>
                )}
                <p className="text-muted text-xs">{t("destination.privacy")}</p>
              </div>
              <LazyDestinationForm offer={offer} areas={areas} locale={locale} />
            </Card>

            {offer.destination ? (
              <section className="flex flex-col gap-3" aria-labelledby="relocation-listings-title">
                <div className="flex flex-col gap-1">
                  <h2 id="relocation-listings-title" className="text-lg font-semibold">
                    {t("listings.title", { count: offer.listings.length })}
                  </h2>
                  <p className="text-muted text-sm">{shareable ? t("listings.leadRecord") : t("listings.lead")}</p>
                  {offer.enquiredListingIds.length > 0 ? (
                    <p className="text-sm font-medium" data-testid="relocation-enquired-count">
                      {t("listings.enquired", { count: offer.enquiredListingIds.length })}
                    </p>
                  ) : null}
                </div>
                <OfferListings
                  offerId={offer.id}
                  listings={offer.listings}
                  record={
                    shareable
                      ? { onTime: shareable.onTime, late: shareable.late, outstanding: shareable.outstanding }
                      : null
                  }
                  locale={locale}
                />
              </section>
            ) : null}

            <DismissOffer offerId={offer.id} />
          </>
        ) : null}

        <p className="text-muted text-xs">{t("offer.footnote")}</p>
      </div>
    </ResidentShell>
  );
}
