import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { INVOICE_STATUS } from "@/domain/status/invoice";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { InvoiceView } from "@/lib/api/types";
import { PayLauncher } from "@/features/resident/pay/PayLauncher";
import { PdfButton } from "@/features/shared/PdfButton";
import { Callout } from "@/ui/components/Callout";
import { Statement } from "@/ui/components/Statement";
import { ActionDock, PaperDocument, Screen, ScreenHeader } from "@/features/shared/Screen";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconWarning } from "@/ui/icons/glyphs/warning";

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

  const statusLabel = root(INVOICE_STATUS[invoice.status].labelKey);
  const attention = open && needsAttention(state);
  // One status row on top (redesign G2 r2): amber only when the resident should act now (D-100), info blue while it
  // is merely open, green once paid; the amount itself lives in the docked bar with "scan to pay".
  const tone = attention ? "warning" : open ? "info" : invoice.status === "paid" ? "success" : "neutral";
  const meta = INVOICE_STATUS[invoice.status];

  return (
    <Screen testId="invoice-detail" data-status={invoice.status}>
      <ScreenHeader flush title={t("title", { period: formatDate(invoice.periodStart, locale, { style: "month" }) })} />

      <div data-testid="invoice-status-row" data-due={state.kind}>
        <Callout
          tone={tone}
          icon={attention ? IconWarning : open ? IconClock : meta.icon}
          className="py-3 font-semibold"
        >
          {open ? t("statusDue", { status: statusLabel, date: formatDate(invoice.dueDate, locale) }) : statusLabel}
        </Callout>
      </div>

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
        <ActionDock className="flex-row items-center justify-between gap-4" testId="invoice-dock">
          <div className="flex min-w-0 flex-col" data-testid="invoice-summary">
            <span className="text-muted text-sm">{partlyPaid ? t("stillDue") : t("toPay")}</span>
            <MoneyDisplay amount={invoice.balance} locale={locale} size="lg" />
          </div>
          <PayLauncher
            invoice={invoice}
            label={t("pay")}
            autoOpen={autoPay}
            payable
            size="lg"
            className="w-auto shrink-0"
            vapidKey={vapidKey}
          />
        </ActionDock>
      ) : (
        <PayLauncher invoice={invoice} label={t("pay")} autoOpen={false} payable={false} vapidKey={vapidKey} />
      )}
    </Screen>
  );
}
