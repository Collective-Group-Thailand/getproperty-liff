import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { INVOICE_STATUS } from "@/domain/status/invoice";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { InvoiceView } from "@/lib/api/types";
import { PayLauncher } from "@/features/resident/pay/PayLauncher";
import { PdfButton } from "@/features/shared/PdfButton";
import { StatusBadge } from "@/ui/components/Badge";
import { Statement } from "@/ui/components/Statement";
import { ActionDock, PaperDocument, Screen, ScreenHeader } from "@/features/shared/Screen";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

import { Due } from "./Due";
import { InvoiceExplainer } from "./InvoiceExplainer";
import { InvoiceLines } from "./InvoiceLines";
import { dueState, isOpen, isZero, needsAttention } from "./model";

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

  const status = (
    <StatusBadge status={INVOICE_STATUS[invoice.status]} label={root(INVOICE_STATUS[invoice.status].labelKey)} />
  );

  return (
    <Screen testId="invoice-detail" data-status={invoice.status}>
      <ScreenHeader
        back={{ href: "/invoices", label: t("back") }}
        title={t("title", { period: formatDate(invoice.periodStart, locale, { style: "month" }) })}
        status={status}
      />

      <section
        aria-labelledby="invoice-amount-title"
        className={
          open ? "rounded-card bg-primary-subtle px-5 py-4" : "rounded-card border-border bg-surface border px-5 py-4"
        }
        data-testid="invoice-summary"
      >
        <h2
          id="invoice-amount-title"
          className={open ? "text-primary-subtle-fg text-sm font-semibold" : "text-muted text-sm"}
        >
          {open ? (partlyPaid ? t("stillDue") : t("toPay")) : t("total")}
        </h2>
        <MoneyDisplay
          amount={open ? invoice.balance : invoice.amountDue}
          locale={locale}
          size="hero"
          tone={open && needsAttention(state) ? "attention" : "default"}
        />
        <Due state={state} dueDate={invoice.dueDate} locale={locale} className="mt-1" />
      </section>

      <PaperDocument
        issuer={invoice.issuerName}
        kind={t("doc.kind")}
        labelledBy="invoice-lines-title"
        number={invoice.number}
        facts={[
          { key: "unit", label: t("doc.unit"), value: invoice.unitNo ?? "—" },
          { key: "issued", label: t("doc.issued"), value: formatDate(invoice.issuedAt, locale) },
          {
            key: "period",
            label: t("doc.period"),
            value: t("doc.range", {
              from: formatDate(invoice.periodStart, locale),
              to: formatDate(invoice.periodEnd, locale),
            }),
          },
          { key: "due", label: t("doc.due"), value: formatDate(invoice.dueDate, locale) },
        ]}
        footer={
          <div className="flex flex-col gap-3">
            {invoice.receipts?.length ? (
              <div data-testid="invoice-receipts">
                <h3 className="text-muted text-sm font-semibold">{t("receipts")}</h3>
                <ul>
                  {invoice.receipts.map((receipt) => (
                    <li key={receipt.id}>
                      <Link
                        href={`/receipts/${receipt.id}`}
                        className="flex min-h-11 items-center justify-between font-mono text-sm font-medium"
                      >
                        {receipt.number}
                        <Icon icon={IconChevronRight} className="text-subtle rtl:rotate-180" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <PdfButton kind="invoice" id={invoice.id} testId="invoice-pdf">
              {t("pdf")}
            </PdfButton>
          </div>
        }
        testId="invoice-document"
      >
        <InvoiceLines lines={invoice.lines} locale={locale} />
        <div className="border-fg mt-2 border-t pt-1" data-testid="invoice-totals">
          <Statement
            caption={t("totals.caption")}
            lines={[
              { key: "total", label: t("totals.total"), value: money(invoice.total) },
              ...(!isZero(invoice.priorBalance)
                ? [{ key: "prior", label: t("totals.prior"), value: money(invoice.priorBalance) }]
                : []),
              { key: "due", label: t("totals.amountDue"), value: money(invoice.amountDue), kind: "result" as const },
              ...(partlyPaid
                ? [
                    {
                      key: "balance",
                      label: t("totals.balance"),
                      value: money(invoice.balance),
                      kind: "subtotal" as const,
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </PaperDocument>

      <InvoiceExplainer invoice={invoice} locale={locale} />

      {/* Mounted for a paid invoice too: the sheet stays open on its paid state when the page re-renders. */}
      {open ? (
        <ActionDock>
          <PayLauncher invoice={invoice} label={t("pay")} autoOpen={autoPay} payable vapidKey={vapidKey} />
        </ActionDock>
      ) : (
        <PayLauncher invoice={invoice} label={t("pay")} autoOpen={false} payable={false} vapidKey={vapidKey} />
      )}
    </Screen>
  );
}
