import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatDateTime, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ReceiptView } from "@/lib/api/types";
import type { PageMeta, ResidentReceipt } from "@/lib/api/types";
import { PdfButton } from "@/features/shared/PdfButton";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon } from "@/ui/icons";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconChevronLeft } from "@/ui/icons/glyphs/chevron-left";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { ShareReceipt } from "./ShareReceipt";

/**
 * Receipts (L2 2.2 §3, D-044): newest first, paged like the API; each opens the receipt — its PDF (the system
 * viewer, `openExternal`) and sharing to a LINE chat. A voided receipt (its payment was reversed) says so.
 */
export async function ReceiptList({
  items,
  meta,
  page,
  locale,
}: {
  items: ResidentReceipt[];
  meta: PageMeta;
  page: number;
  locale: Locale;
}) {
  const t = await getTranslations("resident.receipts");
  const hasOlder = page * meta.perPage < meta.total;
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="receipt-list">
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      {items.length === 0 ? (
        <EmptyState icon={IconBill} title={t("empty")} description={t("emptyBody")} />
      ) : (
        <ul>
          {items.map((receipt) => (
            <li key={receipt.id} className="border-border border-b last:border-b-0">
              <Link
                href={`/receipts/${receipt.id}`}
                className="flex min-h-14 items-center justify-between gap-3 py-2"
                data-testid="receipt-item"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{receipt.number}</span>
                  <span className="text-muted block text-xs">
                    {t("itemMeta", {
                      date: formatDate(receipt.issuedAt, locale),
                      issuer: receipt.issuerName,
                      unit: receipt.unitNo ?? "—",
                    })}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={receipt.voided ? "text-muted tabular-nums line-through" : "tabular-nums"}>
                    {formatTHB(receipt.amount, locale)}
                  </span>
                  {receipt.voided ? (
                    <Badge tone="neutral" size="sm" icon={IconXCircle}>
                      {t("voided")}
                    </Badge>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {page > 1 || hasOlder ? (
        <nav aria-label={t("pages")} className="flex justify-between gap-2">
          {page > 1 ? (
            <Button asChild variant="ghost" size="lg" iconStart={IconChevronLeft}>
              <Link href={page === 2 ? "/receipts" : `/receipts?page=${page - 1}`}>{t("newer")}</Link>
            </Button>
          ) : (
            <span />
          )}
          {hasOlder ? (
            <Button asChild variant="ghost" size="lg">
              <Link href={`/receipts?page=${page + 1}`}>
                {t("older")}
                <Icon icon={IconChevronRight} />
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

/** One receipt: amount, number, issuer, unit, date; PDF; share to LINE; the invoices it paid. */
export async function ReceiptDetail({ receipt, locale }: { receipt: ReceiptView; locale: Locale }) {
  const t = await getTranslations("resident.receipts");
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="receipt-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">{t("detailTitle", { number: receipt.number })}</h1>
        {receipt.voided ? (
          <Badge tone="neutral" icon={IconXCircle}>
            {t("voided")}
          </Badge>
        ) : null}
      </div>
      <Card as="section" padding="lg" aria-labelledby="receipt-amount-title">
        <h2 id="receipt-amount-title" className="text-muted text-sm">
          {t(`kind.${receipt.kind}`)}
        </h2>
        <MoneyDisplay amount={receipt.amount} locale={locale} size="hero" tone={receipt.voided ? "muted" : "success"} />
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{t("issuedAt")}</dt>
          <dd>{formatDateTime(receipt.issuedAt, locale)}</dd>
          <dt className="text-muted">{t("issuer")}</dt>
          <dd>{receipt.issuerName}</dd>
          <dt className="text-muted">{t("unit")}</dt>
          <dd>{receipt.unitNo ?? "—"}</dd>
        </dl>
        {receipt.voided ? <p className="text-muted mt-3 text-sm">{t("voidedBody")}</p> : null}
      </Card>
      {receipt.invoices?.length ? (
        <Card as="section" padding="md" aria-labelledby="receipt-invoices-title">
          <h2 id="receipt-invoices-title" className="font-semibold">
            {t("paidInvoices")}
          </h2>
          <ul className="mt-1">
            {receipt.invoices.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="text-primary flex min-h-12 items-center justify-between font-medium"
                >
                  {invoice.number}
                  <Icon icon={IconChevronRight} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <PdfButton kind="receipt" id={receipt.id} testId="receipt-pdf">
        {t("pdf")}
      </PdfButton>
      {receipt.voided ? null : (
        <ShareReceipt
          receiptId={receipt.id}
          number={receipt.number}
          amount={formatTHB(receipt.amount, locale)}
          issuer={receipt.issuerName}
        />
      )}
    </div>
  );
}
