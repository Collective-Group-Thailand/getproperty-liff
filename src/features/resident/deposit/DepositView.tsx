import { getTranslations } from "next-intl/server";

import { DEPOSIT_STATUS } from "@/domain/status/deposit";
import { SETTLEMENT_STATUS } from "@/domain/status/settlement";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { DepositView as Deposit } from "@/lib/api/types";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { StatusBadge } from "@/ui/components/Badge";

import { LazyDepositResponse } from "./LazyDepositResponse";

function Amount({ label, value, strong }: { label: React.ReactNode; value: string; strong?: boolean }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className={strong ? "font-semibold" : "text-muted text-sm"}>{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? "text-lg font-semibold" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

/**
 * The deposit and its settlement (D-023, B2.4): what is held, each deduction with the move-out photos and the
 * move-in photos of the same item (`beforeEvidenceUrls`), the proposed refund, the deadline, and
 * the resident's answer (accept or dispute with photos) while the API offers it (`nextActions`). Every amount is the
 * API's decimal string; nothing is added up here.
 */
export async function DepositView({ deposit, locale }: { deposit: Deposit; locale: Locale }) {
  const t = await getTranslations("resident.deposit");
  const root = await getTranslations();
  const money = (value: string) => formatTHB(value, locale);
  const settlement = deposit.settlement;
  const actions = new Set(deposit.nextActions);

  return (
    <div className="flex flex-col gap-4 py-5" data-testid="deposit-view">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">{t("title", { unit: deposit.unitNo })}</h1>
        <StatusBadge status={DEPOSIT_STATUS[deposit.status]} label={root(DEPOSIT_STATUS[deposit.status].labelKey)} />
      </div>

      <Card as="section" padding="md" aria-labelledby="deposit-held-title">
        <h2 id="deposit-held-title" className="font-semibold">
          {t("held.title")}
        </h2>
        <dl className="mt-2">
          <Amount label={t("held.security")} value={money(deposit.amountSecurity)} />
          <Amount label={t("held.advance")} value={money(deposit.amountAdvanceRent)} />
        </dl>
        {deposit.receiptNumber ? (
          <p className="text-muted mt-2 text-xs">{t("held.receipt", { number: deposit.receiptNumber })}</p>
        ) : null}
      </Card>

      {settlement ? (
        <>
          <Card as="section" padding="md" aria-labelledby="settlement-title" data-testid="settlement">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="settlement-title" className="font-semibold">
                {t("settlement.title")}
              </h2>
              <StatusBadge
                size="sm"
                status={SETTLEMENT_STATUS[settlement.status]}
                label={root(SETTLEMENT_STATUS[settlement.status].labelKey)}
              />
            </div>
            <p className="text-muted mt-1 text-sm">
              {t("settlement.moveOut", { date: formatDate(settlement.moveOutAt, locale) })}
            </p>
            <dl className="mt-2">
              <Amount label={t("settlement.held")} value={money(settlement.depositHeld)} />
              <Amount label={t("settlement.deductions")} value={money(settlement.deductionsTotal)} />
              <Amount label={t("settlement.utilities")} value={money(settlement.utilitiesFinal)} />
              {settlement.proposedRefund ? (
                <Amount label={t("settlement.proposed")} value={money(settlement.proposedRefund)} strong />
              ) : null}
              {settlement.agreedRefund ? (
                <Amount label={t("settlement.agreed")} value={money(settlement.agreedRefund)} strong />
              ) : null}
              {settlement.refundAmount ? (
                <Amount label={t("settlement.refunded")} value={money(settlement.refundAmount)} strong />
              ) : null}
            </dl>
            <p className="text-muted mt-2 text-sm">
              {t("settlement.deadline", { date: formatDate(settlement.deadlineAt, locale, { style: "long" }) })}
            </p>
            {settlement.isLate ? (
              <Callout tone="warning" className="mt-3">
                {t("settlement.late")}
              </Callout>
            ) : null}
            {settlement.residentResponse === "disputed" && settlement.disputeReason ? (
              <Callout tone="info" className="mt-3" title={t("settlement.disputedTitle")}>
                {settlement.disputeReason}
              </Callout>
            ) : null}
          </Card>

          {deposit.deductions.length ? (
            <section aria-labelledby="deductions-title" className="flex flex-col gap-3">
              <h2 id="deductions-title" className="font-semibold">
                {t("deductions.title")}
              </h2>
              <ul className="flex flex-col gap-3" role="list" data-testid="deductions">
                {deposit.deductions.map((deduction) => (
                  <li key={deduction.id}>
                    <Card padding="md">
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <p className="font-medium">{deduction.description}</p>
                          <p className="text-muted text-sm">{t(`deductions.kind.${deduction.kind}`)}</p>
                        </div>
                        <p className="font-semibold tabular-nums">{money(deduction.amount)}</p>
                      </div>
                      {deduction.evidenceUrls.length || deduction.beforeEvidenceUrls.length ? (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <figure className="flex flex-col gap-1">
                            <figcaption className="text-muted text-xs">{t("deductions.before")}</figcaption>
                            {deduction.beforeEvidenceUrls.length ? (
                              deduction.beforeEvidenceUrls.map((url, i) => (
                                // eslint-disable-next-line @next/next/no-img-element -- 5-minute signed URLs, not optimisable
                                <img
                                  key={i}
                                  src={url}
                                  alt={t("deductions.beforeAlt", { item: deduction.description })}
                                  className="rounded-control border-border aspect-[4/3] w-full border object-cover"
                                  loading="lazy"
                                  width={320}
                                  height={240}
                                />
                              ))
                            ) : (
                              <p className="text-muted text-xs">{t("deductions.noBefore")}</p>
                            )}
                          </figure>
                          <figure className="flex flex-col gap-1">
                            <figcaption className="text-muted text-xs">{t("deductions.after")}</figcaption>
                            {deduction.evidenceUrls.map((url, i) => (
                              // eslint-disable-next-line @next/next/no-img-element -- 5-minute signed URLs, not optimisable
                              <img
                                key={i}
                                src={url}
                                alt={t("deductions.afterAlt", { item: deduction.description })}
                                className="rounded-control border-border aspect-[4/3] w-full border object-cover"
                                loading="lazy"
                                width={320}
                                height={240}
                              />
                            ))}
                          </figure>
                        </div>
                      ) : null}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {actions.has("accept") || actions.has("dispute") ? (
            <LazyDepositResponse
              depositId={deposit.id}
              refund={settlement.proposedRefund ? money(settlement.proposedRefund) : null}
              canAccept={actions.has("accept")}
              canDispute={actions.has("dispute")}
            />
          ) : null}
        </>
      ) : (
        <Callout tone="neutral">{t("noSettlement")}</Callout>
      )}
    </div>
  );
}
