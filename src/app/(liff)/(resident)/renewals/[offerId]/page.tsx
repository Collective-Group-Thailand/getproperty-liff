import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { RENEWAL_STATUS } from "@/domain/status/contract";
import { loadRenewalOffer } from "@/features/resident/contracts/data";
import { isOpenOffer } from "@/features/resident/contracts/model";
import { RenewalDecision } from "@/features/resident/contracts/RenewalDecision";
import { loadLease, pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { formatDate, formatTHB } from "@/i18n/format";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconLease } from "@/ui/icons/glyphs/lease";
import { IconSign } from "@/ui/icons/glyphs/sign";

export async function generateMetadata() {
  const t = await getTranslations("resident.contracts.renewal");
  return { title: t("title") };
}

function Row({ label, children, numeric }: { label: string; children: React.ReactNode; numeric?: boolean }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className={numeric ? "text-right font-medium tabular-nums" : "text-right font-medium"}>{children}</dd>
    </div>
  );
}

/**
 * The landlord's offer to renew (GL3, D-294): the offered rent next to the current one, the term, when the new lease
 * starts and the date to answer by — all as the API stored them — the landlord's message and letter (B7.5), then my
 * answer while the API offers one. Accepted: the renewal lease to read and sign. Declined: the move-out notice the API
 * recorded on the lease (D-219) or the end date. Expired and withdrawn offers are read-only.
 */
export default async function RenewalOfferPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const [t, root, locale, loaded] = await Promise.all([
    getTranslations("resident.contracts.renewal"),
    getTranslations(),
    pageLocale(),
    loadRenewalOffer(offerId),
  ]);
  const back = await getTranslations("resident.contracts.back");
  if (loaded.error) {
    return (
      <ResidentShell active={null}>
        <BackLink href="/contracts">{back("list")}</BackLink>
        <ProblemPage error={loaded.error} />
      </ResidentShell>
    );
  }
  const offer = loaded.data;
  // The lease the offer renews: unit, end date and — after a decline — the notice the API recorded. Optional.
  const lease = (await loadLease(offer.leaseId)).data;
  const money = (value: string) => formatTHB(value, locale);
  const date = (value: string) => formatDate(value, locale);
  const status = RENEWAL_STATUS[offer.state];
  const open = isOpenOffer(offer);
  const terms = t("termsSentence", {
    amount: money(offer.offeredRent),
    months: offer.months,
    start: date(offer.startDate),
  });
  const consequence = lease ? t("decline.consequence", { end: date(lease.endDate) }) : t("decline.consequenceNoDate");

  return (
    <ResidentShell active={null}>
      <BackLink href={`/lease/${offer.leaseId}`}>{back("lease")}</BackLink>
      <div className="flex flex-col gap-4 py-5" data-testid="renewal-offer" data-state={offer.state}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
            <StatusBadge status={status} label={root(status.labelKey)} />
          </div>
          {lease ? (
            <p className="text-muted text-sm">
              {t("subtitle", { unit: lease.unitNo, building: lease.buildingName, operator: lease.tenantName })}
            </p>
          ) : null}
        </div>

        {open ? <p>{t("lead")}</p> : null}

        <Card as="section" aria-labelledby="renewal-terms-title" padding="md">
          <h2 id="renewal-terms-title" className="font-semibold">
            {t("termsTitle")}
          </h2>
          <dl className="mt-2">
            <Row label={t("offeredRent")} numeric>
              <span data-testid="renewal-offered-rent">{t("perMonth", { amount: money(offer.offeredRent) })}</span>
            </Row>
            <Row label={t("currentRent")} numeric>
              {t("perMonth", { amount: money(offer.currentRent) })}
            </Row>
            <Row label={t("months")}>{t("monthsValue", { months: offer.months })}</Row>
            <Row label={t("startDate")}>{date(offer.startDate)}</Row>
            {lease ? <Row label={t("currentEnd")}>{date(lease.endDate)}</Row> : null}
            {open ? <Row label={t("respondBy")}>{date(offer.respondBy)}</Row> : null}
          </dl>
          {offer.message ? (
            <div className="border-border mt-3 border-t pt-3">
              <h3 className="text-sm font-semibold">{t("message")}</h3>
              <p className="text-sm" data-testid="renewal-message">
                {offer.message}
              </p>
            </div>
          ) : null}
        </Card>

        {offer.noticeId ? (
          <Link
            href={`/lease/${offer.leaseId}/notices/${offer.noticeId}`}
            className="text-primary inline-flex min-h-12 items-center text-sm font-medium"
            data-testid="renewal-letter"
          >
            {t("letter")}
          </Link>
        ) : null}

        {open ? (
          <RenewalDecision offerId={offer.id} actions={offer.nextActions} terms={terms} consequence={consequence} />
        ) : null}

        {offer.state === "accepted" ? (
          <div data-testid="renewal-accepted">
            <Callout
              tone="success"
              icon={IconCheckCircle}
              title={t("accepted.title")}
              action={
                offer.newLeaseId ? (
                  <Button asChild size="lg" block iconStart={IconSign}>
                    <Link href={`/lease/${offer.newLeaseId}/sign`} data-testid="renewal-sign">
                      {t("accepted.signCta")}
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              {offer.decidedAt ? t("accepted.body", { date: date(offer.decidedAt) }) : t("accepted.bodyNoDate")}
            </Callout>
          </div>
        ) : null}

        {offer.state === "declined" ? (
          <div className="flex flex-col gap-3" data-testid="renewal-declined">
            <Callout tone="info" icon={IconCalendar} title={t("declined.title")}>
              {lease?.notice?.effectiveDate ? (
                <span data-testid="renewal-declined-notice">
                  {t("declined.notice", { date: date(lease.notice.effectiveDate) })}
                </span>
              ) : lease ? (
                t("declined.ends", { date: date(lease.endDate) })
              ) : (
                t("declined.noLease")
              )}
            </Callout>
            {offer.declineReason ? (
              <p className="text-muted text-sm">{t("declined.reason", { reason: offer.declineReason })}</p>
            ) : null}
            <Button asChild variant="secondary" size="lg" block iconStart={IconLease} iconEnd={IconForward}>
              <Link href={`/lease/${offer.leaseId}`} data-testid="renewal-to-lease">
                {t("declined.toLease")}
              </Link>
            </Button>
          </div>
        ) : null}

        {offer.state === "expired" || offer.state === "withdrawn" ? (
          <Callout tone="neutral" title={t(`${offer.state}.title`)}>
            {t(`${offer.state}.body`)}
          </Callout>
        ) : null}
      </div>
    </ResidentShell>
  );
}
