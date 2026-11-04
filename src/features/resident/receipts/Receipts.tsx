import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatDateTime, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ReceiptView } from "@/lib/api/types";
import type { PageMeta, ResidentReceipt } from "@/lib/api/types";
import { PdfButton } from "@/features/shared/PdfButton";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { List, PaperDocument, Screen, ScreenHeader } from "@/features/shared/Screen";
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
  const back = (await getTranslations("resident.invoices.list"))("title");
  const hasOlder = page * meta.perPage < meta.total;
  return (
    <Screen testId="receipt-list">
      <ScreenHeader back={{ href: "/invoices", label: back }} title={t("title")} />
      {items.length === 0 ? (
        <EmptyState
          variant="card"
          icon={IconBill}
          title={t("empty")}
          description={t("emptyBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/invoices">{back}</Link>
            </Button>
          }
        />
      ) : (
        <List
          rows={items.map((receipt) => ({
            key: receipt.id,
            href: `/receipts/${receipt.id}`,
            testId: "receipt-item",
            title: <span className="font-mono text-sm">{receipt.number}</span>,
            meta: t("itemMeta", {
              date: formatDate(receipt.issuedAt, locale),
              issuer: receipt.issuerName,
              unit: receipt.unitNo ?? "—",
            }),
            end: (
              <span className={receipt.voided ? "text-muted line-through" : undefined}>
                {formatTHB(receipt.amount, locale)}
              </span>
            ),
            endMeta: receipt.voided ? (
              <Badge tone="neutral" size="sm" icon={IconXCircle}>
                {t("voided")}
              </Badge>
            ) : undefined,
          }))}
        />
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
    </Screen>
  );
}

/** One receipt: amount, number, issuer, unit, date; PDF; share to LINE; the invoices it paid. */
export async function ReceiptDetail({ receipt, locale }: { receipt: ReceiptView; locale: Locale }) {
  const t = await getTranslations("resident.receipts");
  return (
    <Screen testId="receipt-detail">
      <ScreenHeader
        flush
        title={t("detailTitle", { number: receipt.number })}
        status={
          receipt.voided ? (
            <Badge tone="neutral" icon={IconXCircle}>
              {t("voided")}
            </Badge>
          ) : undefined
        }
      />
      <PaperDocument
        issuer={receipt.issuerName}
        kind={t(`kind.${receipt.kind}`)}
        number={receipt.number}
        labelledBy="receipt-amount-title"
        facts={[
          { key: "issued", label: t("issuedAt"), value: formatDateTime(receipt.issuedAt, locale) },
          { key: "unit", label: t("unit"), value: receipt.unitNo ?? "—" },
        ]}
        footer={
          <div className="flex flex-col gap-2">
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
        }
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-muted">{t("amount")}</span>
          <MoneyDisplay amount={receipt.amount} locale={locale} size="lg" tone={receipt.voided ? "muted" : "default"} />
        </div>
        {receipt.voided ? <p className="text-muted mt-3 text-sm">{t("voidedBody")}</p> : null}
        {receipt.invoices?.length ? (
          <div className="border-border mt-4 border-t pt-3">
            <h3 className="text-muted text-sm font-semibold">{t("paidInvoices")}</h3>
            <ul>
              {receipt.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="flex min-h-11 items-center justify-between font-mono text-sm font-medium"
                  >
                    {invoice.number}
                    <Icon icon={IconChevronRight} className="text-subtle rtl:rotate-180" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </PaperDocument>
    </Screen>
  );
}
