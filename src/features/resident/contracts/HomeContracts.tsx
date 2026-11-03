import { getTranslations } from "next-intl/server";

import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { RenewalOffer, ResidentContract } from "@/lib/api/types";
import type { ListRow } from "@/features/shared/Screen";
import { IconLease } from "@/ui/icons/glyphs/lease";
import { IconSign } from "@/ui/icons/glyphs/sign";

import { awaitsMySignature, isOpenOffer } from "./model";

/**
 * Home "to do" rows (GL3, D-294): documents of the contract library waiting for my signature and an open offer to
 * renew — only when there is something to do. Rows, not cards: home has one filled action (the bill).
 */
export async function homeContractRows({
  contracts,
  offers,
  locale,
}: {
  contracts: ResidentContract[];
  offers: RenewalOffer[];
  locale: Locale;
}): Promise<ListRow[]> {
  const toSign = contracts.filter(awaitsMySignature);
  const offer = offers.find(isOpenOffer);
  if (!toSign.length && !offer) return [];
  const t = await getTranslations("resident.contracts.home");
  const rows: ListRow[] = [];
  if (offer)
    rows.push({
      key: "renewal",
      href: `/renewals/${offer.id}`,
      icon: IconLease,
      title: t("renewalTitle"),
      meta: t("renewalBody", {
        amount: formatTHB(offer.offeredRent, locale),
        months: offer.months,
        date: formatDate(offer.respondBy, locale),
      }),
      testId: "home-renewal-offer",
    });
  if (toSign.length)
    rows.push({
      key: "sign",
      href: toSign.length === 1 ? `/contracts/${toSign[0]!.id}` : "/contracts",
      icon: IconSign,
      title: t("signTitle"),
      meta: t("signBody", { count: toSign.length }),
      testId: "home-contracts-to-sign",
    });
  return rows;
}
