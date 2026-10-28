import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { CONTRACT_STATUS, RENEWAL_STATUS } from "@/domain/status/contract";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { RenewalOffer, ResidentContract } from "@/lib/api/types";
import { Icon } from "@/ui/icons";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

import { awaitsMySignature, isOpenOffer } from "./model";

/** One document of the contract library as a row: kind, title, number, state (D-294). */
export async function ContractCard({ contract, locale }: { contract: ResidentContract; locale: Locale }) {
  const t = await getTranslations("resident.contracts");
  const root = await getTranslations();
  const status = CONTRACT_STATUS[contract.state];
  const toSign = awaitsMySignature(contract);
  return (
    <Link
      href={`/contracts/${contract.id}`}
      className="block"
      data-testid="contract-card"
      data-kind={contract.kind}
      data-state={contract.state}
    >
      <Card interactive padding="md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{t(`kind.${contract.kind}`)}</span>
          <StatusBadge size="sm" status={status} label={toSign ? t("list.yourSignature") : root(status.labelKey)} />
        </div>
        <p className="mt-1 text-sm" lang={contract.language}>
          {contract.title}
        </p>
        <p className="text-muted flex items-center justify-between gap-2 text-sm">
          <span>
            {contract.number ? t("list.number", { number: contract.number }) : null}
            {contract.sentAt ? ` · ${t("list.sentOn", { date: formatDate(contract.sentAt, locale) })}` : null}
          </span>
          <Icon icon={IconChevronRight} className="shrink-0" />
        </p>
      </Card>
    </Link>
  );
}

/** An offer to renew as a row: offered rent, term, the answer-by date while it is open (D-294). */
export async function RenewalCard({ offer, locale }: { offer: RenewalOffer; locale: Locale }) {
  const t = await getTranslations("resident.contracts");
  const root = await getTranslations();
  const status = RENEWAL_STATUS[offer.state];
  return (
    <Link href={`/renewals/${offer.id}`} className="block" data-testid="renewal-card" data-state={offer.state}>
      <Card interactive padding="md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{t("renewal.cardTitle")}</span>
          <StatusBadge size="sm" status={status} label={root(status.labelKey)} />
        </div>
        <p className="mt-1 text-sm tabular-nums">
          {t("renewal.cardTerms", {
            amount: formatTHB(offer.offeredRent, locale),
            months: offer.months,
            start: formatDate(offer.startDate, locale),
          })}
        </p>
        <p className="text-muted flex items-center justify-between gap-2 text-sm">
          <span>
            {isOpenOffer(offer) ? t("renewal.answerBy", { date: formatDate(offer.respondBy, locale) }) : null}
          </span>
          <Icon icon={IconChevronRight} className="shrink-0" />
        </p>
      </Card>
    </Link>
  );
}

/** A titled list of cards; nothing when empty. */
export function CardSection({
  id,
  title,
  children,
  testId,
}: {
  id: string;
  title: string;
  children: React.ReactNode[];
  testId: string;
}) {
  if (!children.length) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2" data-testid={testId}>
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      <ul className="flex flex-col gap-3" role="list">
        {children.map((child, index) => (
          <li key={index}>{child}</li>
        ))}
      </ul>
    </section>
  );
}
