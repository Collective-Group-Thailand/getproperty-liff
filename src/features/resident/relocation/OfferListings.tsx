import { getTranslations } from "next-intl/server";

import { formatNumber, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";
import { Badge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconBuilding } from "@/ui/icons/glyphs/building";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconExternal } from "@/ui/icons/glyphs/external";
import { IconImage } from "@/ui/icons/glyphs/image";
import { IconShield } from "@/ui/icons/glyphs/shield";

import { ListingEnquire } from "./ListingEnquire";
import type { ListingSummary } from "./model";

/**
 * The public listings in my destination, as the API matched them (D-299: published, up to my highest rent, not of the
 * landlord I leave, at most `relocation.offer.max_listings`): the facts that decide whether to ask, the badges the
 * API gives (verified owner, verified vacant) and *Ask the owner* — which may carry my rent record.
 */
export async function OfferListings({
  offerId,
  listings,
  record,
  locale,
}: {
  offerId: string;
  listings: ListingSummary[];
  record: Pick<Schemas["RentRecordDto"], "onTime" | "late" | "outstanding"> | null;
  locale: Locale;
}) {
  const t = await getTranslations("resident.relocation.listings");
  if (listings.length === 0) {
    return (
      <div data-testid="relocation-listings-empty">
        <EmptyState icon={IconBuilding} title={t("emptyTitle")} description={t("emptyBody")} />
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-4" role="list" data-testid="relocation-listings">
      {listings.map((listing) => {
        const facts = [
          listing.sizeSqm ? t("size", { size: listing.sizeSqm }) : null,
          listing.bedrooms !== null && listing.bedrooms !== undefined
            ? listing.bedrooms === 0
              ? t("studio")
              : t("bedrooms", { count: listing.bedrooms })
            : null,
          [listing.district, listing.province].filter(Boolean).join(", ") || null,
        ].filter((fact): fact is string => !!fact);
        const transit = listing.nearestTransit;
        return (
          <li key={listing.slug}>
            <Card
              as="article"
              padding="none"
              className="overflow-hidden"
              data-testid="relocation-listing"
              data-slug={listing.slug}
            >
              {listing.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed object-storage rendition
                <img
                  src={listing.cover.url}
                  alt={listing.cover.caption ?? listing.title}
                  width={listing.cover.width}
                  height={listing.cover.height}
                  loading="lazy"
                  className="bg-bg-subtle aspect-[16/9] w-full object-cover"
                />
              ) : (
                <div className="bg-bg-subtle text-muted flex aspect-[16/9] w-full flex-col items-center justify-center gap-2">
                  <Icon icon={IconImage} size={28} />
                  <span className="text-sm">{t("noPhoto")}</span>
                </div>
              )}
              <div className="flex flex-col gap-2 p-4">
                <h3 className="text-lg font-semibold">{listing.title}</h3>
                <p className="text-lg font-semibold tabular-nums">
                  {formatTHB(listing.rent, locale, { decimals: 0 })}
                  <span className="text-muted text-sm font-normal">{t("perMonth")}</span>
                </p>
                {facts.length ? <p className="text-muted text-sm">{facts.join(" · ")}</p> : null}
                {transit ? (
                  <p className="text-muted text-sm">
                    {t("transit", { name: transit.name, distance: formatNumber(transit.distanceM, locale) })}
                  </p>
                ) : null}
                {listing.verifiedOwner || listing.verifiedVacant ? (
                  <div className="flex flex-wrap gap-2">
                    {listing.verifiedOwner ? (
                      <Badge tone="success" size="sm" icon={IconShield}>
                        {t("verifiedOwner")}
                      </Badge>
                    ) : null}
                    {listing.verifiedVacant ? (
                      <Badge tone="success" size="sm" icon={IconCheckCircle}>
                        {t("verifiedVacant")}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-col gap-2">
                  <ListingEnquire offerId={offerId} slug={listing.slug} title={listing.title} record={record} />
                  <a
                    href={`/rent/${listing.slug}`}
                    className="text-primary flex min-h-12 items-center justify-center gap-2 font-medium underline-offset-4 hover:underline"
                    data-testid="relocation-listing-open"
                  >
                    {t("view")}
                    <Icon icon={IconExternal} />
                  </a>
                </div>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
