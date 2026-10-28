import { getTranslations } from "next-intl/server";

import { CardSection, ContractCard, RenewalCard } from "@/features/resident/contracts/ContractList";
import { loadContracts, loadRenewalOffers } from "@/features/resident/contracts/data";
import { awaitsMySignature, isOpenOffer, sortContracts, sortOffers } from "@/features/resident/contracts/model";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconLease } from "@/ui/icons/glyphs/lease";

export async function generateMetadata() {
  const t = await getTranslations("resident.contracts");
  return { title: t("list.title") };
}

/**
 * My contracts and offers (GL3, D-294): documents of the contract library to sign or signed (reservation, addendum
 * …, across every tenant) and the landlords' offers to renew, open ones first.
 */
export default async function ContractsPage() {
  const [t, locale, contracts, offers] = await Promise.all([
    getTranslations("resident.contracts"),
    pageLocale(),
    loadContracts(),
    loadRenewalOffers(),
  ]);
  if (contracts.error || offers.error) {
    const error = (contracts.error ?? offers.error)!;
    return (
      <ResidentShell active={null}>
        <BackLink href="/">{t("back.home")}</BackLink>
        <ProblemPage error={error} />
      </ResidentShell>
    );
  }
  const docs = sortContracts(contracts.data);
  const sorted = sortOffers(offers.data);
  const toSign = docs.filter(awaitsMySignature);
  const others = docs.filter((c) => !awaitsMySignature(c));
  const open = sorted.filter(isOpenOffer);
  const decided = sorted.filter((o) => !isOpenOffer(o));
  return (
    <ResidentShell active={null}>
      <BackLink href="/">{t("back.home")}</BackLink>
      {docs.length === 0 && sorted.length === 0 ? (
        <div data-testid="contracts-empty">
          <EmptyState icon={IconLease} title={t("list.emptyTitle")} description={t("list.emptyBody")} />
        </div>
      ) : (
        <div className="flex flex-col gap-5 py-5" data-testid="contracts-page">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-semibold">{t("list.title")}</h1>
            <p className="text-muted text-sm">{t("list.lead")}</p>
          </div>
          <CardSection id="contracts-offers-open" title={t("list.openOffers")} testId="contracts-open-offers">
            {open.map((offer) => (
              <RenewalCard key={offer.id} offer={offer} locale={locale} />
            ))}
          </CardSection>
          <CardSection id="contracts-to-sign" title={t("list.toSign")} testId="contracts-to-sign">
            {toSign.map((contract) => (
              <ContractCard key={contract.id} contract={contract} locale={locale} />
            ))}
          </CardSection>
          <CardSection id="contracts-others" title={t("list.others")} testId="contracts-others">
            {others.map((contract) => (
              <ContractCard key={contract.id} contract={contract} locale={locale} />
            ))}
          </CardSection>
          <CardSection id="contracts-offers-past" title={t("list.pastOffers")} testId="contracts-past-offers">
            {decided.map((offer) => (
              <RenewalCard key={offer.id} offer={offer} locale={locale} />
            ))}
          </CardSection>
        </div>
      )}
    </ResidentShell>
  );
}
