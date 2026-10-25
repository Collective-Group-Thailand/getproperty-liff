import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

type Notice = Schemas["LeaseNoticeDto"];

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** The letters from the landlord on a lease (B7.5, D-253), newest first; each opens its own page. */
export async function LetterList({ leaseId, notices, locale }: { leaseId: string; notices: Notice[]; locale: Locale }) {
  if (!notices.length) return null;
  const t = await getTranslations("resident.lease.letters");
  return (
    <Card as="section" aria-labelledby="letters-title" data-testid="lease-letters">
      <h2 id="letters-title" className="mb-2 font-semibold">
        {t("title")}
      </h2>
      <ul className="divide-border m-0 flex list-none flex-col divide-y p-0">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Link
              href={`/lease/${leaseId}/notices/${notice.id}`}
              className="flex min-h-12 items-center justify-between gap-3 py-3"
              data-testid="lease-letter"
            >
              <span className="flex flex-col">
                <span className="font-medium">{t(`kinds.${notice.kind}`)}</span>
                <span className="text-muted text-sm">{t("sentOn", { date: formatDate(notice.issuedOn, locale) })}</span>
              </span>
              <Icon icon={IconChevronRight} className="text-muted shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * One letter (B7.5): what the landlord tells me in plain words — the key dates and amounts as the API stored them —
 * then the full letter as a PDF. A renewal offer says how to answer; an overdue-rent letter says it ends nothing.
 */
export async function LetterView({
  leaseId,
  notice,
  tenantName,
  locale,
  documentButton,
}: {
  leaseId: string;
  notice: Notice;
  tenantName: string;
  locale: Locale;
  documentButton: React.ReactNode;
}) {
  const t = await getTranslations("resident.lease.letters");
  const date = (value: string) => formatDate(value, locale);
  const money = (value: string) => formatTHB(value, locale);
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="letter-view" data-kind={notice.kind}>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t(`kinds.${notice.kind}`)}</h1>
        <p className="text-muted text-sm">{t("from", { name: tenantName, number: notice.number })}</p>
      </div>
      <Card>
        <p className="mb-3">{t(`lead.${notice.kind}`)}</p>
        <dl className="m-0">
          <Row label={t("sentOnLabel")}>{date(notice.issuedOn)}</Row>
          {notice.newRent ? <Row label={t("newRent")}>{money(notice.newRent)}</Row> : null}
          {notice.renewalMonths ? (
            <Row label={t("months")}>{t("monthsValue", { months: notice.renewalMonths })}</Row>
          ) : null}
          {notice.effectiveDate ? (
            <Row label={t(notice.kind === "rent_increase" || notice.kind === "renewal_offer" ? "fromDate" : "endsOn")}>
              {date(notice.effectiveDate)}
            </Row>
          ) : null}
          {notice.amountDue ? <Row label={t("amountDue")}>{money(notice.amountDue)}</Row> : null}
          {notice.respondBy ? (
            <Row label={t(notice.kind === "late_payment" ? "payBy" : "answerBy")}>{date(notice.respondBy)}</Row>
          ) : null}
        </dl>
        {notice.items.length ? (
          <ul className="text-muted mt-3 flex flex-col gap-1 text-sm" data-testid="letter-items">
            {notice.items.map((item) => (
              <li key={item.number} className="flex justify-between gap-2">
                <span>{t("item", { number: item.number, date: date(item.dueDate) })}</span>
                <span className="tabular-nums">{money(item.balance)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {notice.message ? (
          <p className="border-border mt-3 border-t pt-3 text-sm" data-testid="letter-message">
            {notice.message}
          </p>
        ) : null}
      </Card>
      {documentButton}
      <p className="text-muted text-sm">{t(`after.${notice.kind}`)}</p>
      {notice.kind === "late_payment" ? (
        <Link href="/invoices" className="text-primary inline-flex min-h-12 items-center text-sm font-medium">
          {t("toBills")}
        </Link>
      ) : null}
      <Link href={`/lease/${leaseId}`} className="text-primary inline-flex min-h-12 items-center text-sm font-medium">
        {t("toLease")}
      </Link>
    </div>
  );
}
