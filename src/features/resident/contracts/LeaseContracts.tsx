import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { RenewalOffer, ResidentContract } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { IconForward } from "@/ui/icons/glyphs/forward";

import { CardSection, ContractCard } from "./ContractList";
import { isOpenOffer } from "./model";

/**
 * On the lease page (GL3, D-294): the open offer to renew this lease (answer it there), the documents of the contract
 * library on this lease (an addendum …) and the way to all my contracts and offers.
 */
export async function LeaseContracts({
  leaseId,
  contracts,
  offers,
  locale,
}: {
  leaseId: string;
  contracts: ResidentContract[];
  offers: RenewalOffer[];
  locale: Locale;
}) {
  const t = await getTranslations("resident.contracts");
  const offer = offers.find((candidate) => candidate.leaseId === leaseId && isOpenOffer(candidate));
  const mine = contracts.filter((contract) => contract.leaseId === leaseId);
  return (
    <div className="flex flex-col gap-4" data-testid="lease-contracts">
      {offer ? (
        <div data-testid="lease-renewal-offer">
          <Callout
            tone="info"
            title={t("renewal.leaseTitle")}
            action={
              <Button asChild size="lg" block iconEnd={IconForward}>
                <Link href={`/renewals/${offer.id}`} data-testid="lease-renewal-open">
                  {t("renewal.leaseCta")}
                </Link>
              </Button>
            }
          >
            {t("renewal.leaseBody", {
              amount: formatTHB(offer.offeredRent, locale),
              months: offer.months,
              date: formatDate(offer.respondBy, locale),
            })}
          </Callout>
        </div>
      ) : null}
      <CardSection id="lease-contracts-title" title={t("lease.title")} testId="lease-contract-list">
        {mine.map((contract) => (
          <ContractCard key={contract.id} contract={contract} locale={locale} />
        ))}
      </CardSection>
      <Link
        href="/contracts"
        className="text-primary inline-flex min-h-12 items-center text-sm font-medium"
        data-testid="lease-all-contracts"
      >
        {t("lease.all")}
      </Link>
    </div>
  );
}
