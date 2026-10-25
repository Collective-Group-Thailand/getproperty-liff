import { getLocale, getTranslations } from "next-intl/server";

import { formatTHB } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { Badge } from "@/ui/components/Badge";
import { Icon } from "@/ui/icons";
import { IconImage } from "@/ui/icons/glyphs/image";
import { IconShield } from "@/ui/icons/glyphs/shield";

import type { PublicListing } from "./model";

/**
 * What someone is asking about (L5 5.1, D-252), the facts that decide whether to ask at all: the cover, rent, size
 * and rooms, where, who the owner is and whether getproperty verified them, the deposit terms.
 */
export async function ListingSummary({ listing }: { listing: PublicListing }) {
  const [t, current] = await Promise.all([getTranslations("prospect.rent.listing"), getLocale()]);
  const locale = isLocale(current) ? current : "th";
  const cover = listing.cover ?? listing.photos[0] ?? null;
  const facts = [
    listing.sizeSqm ? t("size", { size: listing.sizeSqm }) : null,
    listing.bedrooms !== null ? t("bedrooms", { count: listing.bedrooms }) : null,
    [listing.district, listing.province].filter(Boolean).join(", ") || null,
  ].filter((fact): fact is string => !!fact);
  return (
    <article className="border-border bg-surface rounded-card overflow-hidden border" data-testid="prospect-listing">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed object-storage rendition
        <img
          src={cover.url}
          alt={cover.caption ?? listing.title}
          width={cover.width}
          height={cover.height}
          className="bg-bg-subtle aspect-[16/10] w-full object-cover"
        />
      ) : (
        <div className="bg-bg-subtle text-muted flex aspect-[16/10] w-full flex-col items-center justify-center gap-2">
          <Icon icon={IconImage} size={32} />
          <span className="text-sm">{t("noPhoto")}</span>
        </div>
      )}
      <div className="flex flex-col gap-2 p-4">
        <h1 className="font-display text-xl font-semibold">{listing.title}</h1>
        <p className="text-lg font-semibold tabular-nums">
          {formatTHB(listing.rent, locale, { decimals: 0 })}
          <span className="text-muted text-sm font-normal">{t("perMonth")}</span>
        </p>
        {facts.length ? <p className="text-muted text-sm">{facts.join(" · ")}</p> : null}
        <p className="text-muted text-sm">
          {t("terms", { deposit: listing.depositMonths, advance: listing.advanceMonths, term: listing.minTermMonths })}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("owner", { name: listing.ownerDisplayName })}</span>
          {listing.verifiedOwner ? (
            <Badge tone="success" size="sm" icon={IconShield}>
              {t("verified")}
            </Badge>
          ) : null}
        </div>
      </div>
    </article>
  );
}
