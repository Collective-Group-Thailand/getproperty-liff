import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { RenewalOffer, ResidentContract } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconLease } from "@/ui/icons/glyphs/lease";
import { IconSign } from "@/ui/icons/glyphs/sign";

import { awaitsMySignature, isOpenOffer } from "./model";

/**
 * Home cards (GL3, D-294): documents of the contract library waiting for my signature and an open offer to renew —
 * shown only when there is something to do.
 */
export async function HomeContracts({
  contracts,
  offers,
  locale,
}: {
  contracts: ResidentContract[];
  offers: RenewalOffer[];
  locale: Locale;
}) {
  const toSign = contracts.filter(awaitsMySignature);
  const offer = offers.find(isOpenOffer);
  if (!toSign.length && !offer) return null;
  const t = await getTranslations("resident.contracts.home");
  return (
    <>
      {offer ? (
        <Card
          as="section"
          aria-labelledby="home-renewal-title"
          padding="lg"
          className="bg-primary-subtle border-transparent"
          data-testid="home-renewal-offer"
        >
          <h2 id="home-renewal-title" className="text-primary-subtle-fg font-semibold">
            {t("renewalTitle")}
          </h2>
          <p className="text-muted mt-1 text-sm">
            {t("renewalBody", {
              amount: formatTHB(offer.offeredRent, locale),
              months: offer.months,
              date: formatDate(offer.respondBy, locale),
            })}
          </p>
          <div className="mt-4">
            <Button asChild block iconStart={IconLease} iconEnd={IconForward}>
              <Link href={`/renewals/${offer.id}`}>{t("renewalCta")}</Link>
            </Button>
          </div>
        </Card>
      ) : null}
      {toSign.length ? (
        <Card
          as="section"
          aria-labelledby="home-contracts-title"
          padding="lg"
          className="bg-primary-subtle border-transparent"
          data-testid="home-contracts-to-sign"
        >
          <h2 id="home-contracts-title" className="text-primary-subtle-fg font-semibold">
            {t("signTitle")}
          </h2>
          <p className="text-muted mt-1 text-sm">{t("signBody", { count: toSign.length })}</p>
          <div className="mt-4">
            <Button asChild block iconStart={IconSign} iconEnd={IconForward}>
              <Link href={toSign.length === 1 ? `/contracts/${toSign[0]!.id}` : "/contracts"}>{t("signCta")}</Link>
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}
