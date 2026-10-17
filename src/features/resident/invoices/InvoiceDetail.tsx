import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { INVOICE_STATUS } from "@/domain/status/invoice";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { InvoiceView } from "@/lib/api/contract-requests";
import { PayLauncher } from "@/features/resident/pay/PayLauncher";
import { PdfButton } from "@/features/shared/PdfButton";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

import { Due } from "./Due";
import { InvoiceExplainer } from "./InvoiceExplainer";
import { InvoiceLines } from "./InvoiceLines";
import { dueState, isOpen, isZero, needsAttention } from "./model";

function Row({ label, value, strong }: { label: React.ReactNode; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={strong ? "font-semibold" : "text-muted text-sm"}>{label}</dt>
      <dd className={`text-end tabular-nums ${strong ? "text-lg font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

/**
 * One invoice (L2 2.1 §3): what to pay and by when (status, due date in words, the pay button that opens the
 * QR sheet), the lines as issued (D-022 disclosure, meter photos), the totals as the API states them — total,
 * earlier balance, amount due, what is still open — the PDF, the receipts of its payments and "invoice
 * explained". Nothing is added up here.
 */
export async function InvoiceDetail({
  invoice,
  locale,
  today,
  autoPay,
  vapidKey,
}: {
  invoice: InvoiceView;
  locale: Locale;
  today: string;
  autoPay: boolean;
  vapidKey?: string;
}) {
  const t = await getTranslations("resident.invoices.detail");
  const root = await getTranslations();
  const state = dueState(invoice, today);
  const open = isOpen(invoice);
  const money = (value: string) => formatTHB(value, locale);
  const partlyPaid = open && invoice.balance !== invoice.amountDue;

  return (
    <div className="flex flex-col gap-4 py-5" data-testid="invoice-detail" data-status={invoice.status}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold">
            {t("title", { period: formatDate(invoice.periodStart, locale, { style: "month" }) })}
          </h1>
          <StatusBadge status={INVOICE_STATUS[invoice.status]} label={root(INVOICE_STATUS[invoice.status].labelKey)} />
        </div>
        <p className="text-muted text-sm">
          {t("meta", { number: invoice.number, issuer: invoice.issuerName, unit: invoice.unitNo ?? "—" })}
        </p>
        <p className="text-muted text-xs">
          {t("periodIssued", {
            from: formatDate(invoice.periodStart, locale),
            to: formatDate(invoice.periodEnd, locale),
            issued: formatDate(invoice.issuedAt, locale),
          })}
        </p>
      </div>

      <Card
        as="section"
        padding="lg"
        aria-labelledby="invoice-amount-title"
        className={open ? "bg-primary-subtle border-transparent" : undefined}
        data-testid="invoice-summary"
      >
        <h2 id="invoice-amount-title" className="text-muted text-sm">
          {open ? (partlyPaid ? t("stillDue") : t("toPay")) : t("total")}
        </h2>
        <MoneyDisplay
          amount={open ? invoice.balance : invoice.amountDue}
          locale={locale}
          size="hero"
          tone={open && needsAttention(state) ? "attention" : "default"}
        />
        <Due state={state} dueDate={invoice.dueDate} locale={locale} className="mt-1" />
        {/* Mounted for a paid invoice too: the sheet stays open on its paid state when the page re-renders. */}
        <PayLauncher
          invoice={invoice}
          label={t("pay")}
          autoOpen={autoPay && open}
          payable={open}
          className="mt-4"
          vapidKey={vapidKey}
        />
      </Card>

      <Card as="section" padding="md" aria-labelledby="invoice-lines-title">
        <h2 id="invoice-lines-title" className="mb-2 font-semibold">
          {t("linesTitle")}
        </h2>
        <InvoiceLines lines={invoice.lines} locale={locale} />
        <dl className="border-border mt-3 border-t pt-2" data-testid="invoice-totals">
          <Row label={t("totals.total")} value={money(invoice.total)} />
          {!isZero(invoice.priorBalance) ? <Row label={t("totals.prior")} value={money(invoice.priorBalance)} /> : null}
          <Row label={t("totals.amountDue")} value={money(invoice.amountDue)} strong />
          {partlyPaid ? <Row label={t("totals.balance")} value={money(invoice.balance)} strong /> : null}
        </dl>
      </Card>

      {invoice.receipts?.length ? (
        <Card as="section" padding="md" aria-labelledby="invoice-receipts-title" data-testid="invoice-receipts">
          <h2 id="invoice-receipts-title" className="font-semibold">
            {t("receipts")}
          </h2>
          <ul className="mt-1">
            {invoice.receipts.map((receipt) => (
              <li key={receipt.id}>
                <Link
                  href={`/receipts/${receipt.id}`}
                  className="text-primary flex min-h-12 items-center justify-between font-medium"
                >
                  {receipt.number}
                  <Icon icon={IconChevronRight} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <PdfButton kind="invoice" id={invoice.id} testId="invoice-pdf">
        {t("pdf")}
      </PdfButton>

      <InvoiceExplainer invoice={invoice} locale={locale} />
    </div>
  );
}
