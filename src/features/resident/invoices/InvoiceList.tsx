import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { INVOICE_STATUS } from "@/domain/status/invoice";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { InvoiceView } from "@/lib/api/types";
import type { PageMeta } from "@/lib/api/types";
import { PayLauncher } from "@/features/resident/pay/PayLauncher";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon } from "@/ui/icons";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconChevronLeft } from "@/ui/icons/glyphs/chevron-left";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

import { Due } from "./Due";
import { byPeriod, dueState, isOpen, needsAttention } from "./model";

async function OpenInvoice({
  invoice,
  locale,
  today,
  showUnit,
  vapidKey,
}: {
  invoice: InvoiceView;
  locale: Locale;
  today: string;
  showUnit: boolean;
  vapidKey?: string;
}) {
  const t = await getTranslations("resident.invoices.list");
  const root = await getTranslations();
  const state = dueState(invoice, today);
  return (
    <Card as="li" padding="md" className="flex flex-col gap-2" data-testid="open-invoice" data-invoice={invoice.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/invoices/${invoice.id}`}
            className="text-primary inline-flex min-h-12 items-center gap-1 font-semibold"
          >
            {t("period", { period: formatDate(invoice.periodStart, locale, { style: "month" }) })}
            <Icon icon={IconChevronRight} />
          </Link>
          <p className="text-muted text-sm">
            {showUnit
              ? t("issuerUnit", { issuer: invoice.issuerName, unit: invoice.unitNo ?? "—" })
              : invoice.issuerName}
          </p>
        </div>
        <StatusBadge
          status={INVOICE_STATUS[invoice.status]}
          label={root(INVOICE_STATUS[invoice.status].labelKey)}
          size="sm"
        />
      </div>
      <MoneyDisplay
        amount={invoice.balance}
        locale={locale}
        size="lg"
        tone={needsAttention(state) ? "attention" : "default"}
      />
      <Due state={state} dueDate={invoice.dueDate} locale={locale} />
      <PayLauncher invoice={invoice} label={t("pay")} size="lg" testId="open-invoice-pay" vapidKey={vapidKey} />
    </Card>
  );
}

/**
 * Invoices (L2 2.1 §2): what is still to pay first — the one due soonest on top, each with its amount, due date in
 * words and a pay button — then the history by billing period (newest first, paged like the API). Receipts are one
 * tap away. With several units the unit is named on each invoice.
 */
export async function InvoiceList({
  open,
  history,
  meta,
  page,
  locale,
  today,
  showUnit,
  vapidKey,
}: {
  open: InvoiceView[];
  history: InvoiceView[];
  meta: PageMeta;
  page: number;
  locale: Locale;
  today: string;
  showUnit: boolean;
  vapidKey?: string;
}) {
  const t = await getTranslations("resident.invoices.list");
  const root = await getTranslations();
  const past = history.filter((invoice) => !isOpen(invoice));
  const hasOlder = page * meta.perPage < meta.total;

  return (
    <div className="flex flex-col gap-5 py-5" data-testid="invoice-list">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <Link
          href="/receipts"
          className="text-primary inline-flex min-h-12 items-center gap-1 font-medium"
          data-testid="to-receipts"
        >
          {t("receipts")}
          <Icon icon={IconChevronRight} />
        </Link>
      </div>

      {page === 1 ? (
        <section aria-labelledby="open-title" className="flex flex-col gap-3">
          <h2 id="open-title" className="font-semibold">
            {t("openTitle")}
          </h2>
          {open.length ? (
            <ul className="flex flex-col gap-3">
              {open.map((invoice) => (
                <OpenInvoice
                  key={invoice.id}
                  invoice={invoice}
                  locale={locale}
                  today={today}
                  showUnit={showUnit}
                  vapidKey={vapidKey}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={IconCheckCircle} title={t("nothingDue")} description={t("nothingDueBody")} />
          )}
        </section>
      ) : null}

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="font-semibold">
          {t("historyTitle")}
        </h2>
        {past.length === 0 ? (
          <p className="text-muted text-sm">{t("noHistory")}</p>
        ) : (
          byPeriod(past).map(([period, invoices]) => (
            <div key={period} data-testid="history-period" data-period={period}>
              <h3 className="text-muted text-sm font-semibold">
                {formatDate(`${period}-01`, locale, { style: "month" })}
              </h3>
              <ul>
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="border-border border-b last:border-b-0">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="flex min-h-14 items-center justify-between gap-3 py-2"
                      data-testid="history-invoice"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon icon={IconBill} className="text-muted shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{invoice.number}</span>
                          <span className="text-muted block text-xs">
                            {showUnit
                              ? t("issuerUnit", { issuer: invoice.issuerName, unit: invoice.unitNo ?? "—" })
                              : invoice.issuerName}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tabular-nums">{formatTHB(invoice.amountDue, locale)}</span>
                        <StatusBadge
                          status={INVOICE_STATUS[invoice.status]}
                          label={root(INVOICE_STATUS[invoice.status].labelKey)}
                          size="sm"
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {page > 1 || hasOlder ? (
          <nav aria-label={t("pages")} className="flex justify-between gap-2">
            {page > 1 ? (
              <Button asChild variant="ghost" size="lg" iconStart={IconChevronLeft}>
                <Link href={page === 2 ? "/invoices" : `/invoices?page=${page - 1}`}>{t("newer")}</Link>
              </Button>
            ) : (
              <span />
            )}
            {hasOlder ? (
              <Button asChild variant="ghost" size="lg">
                <Link href={`/invoices?page=${page + 1}`}>
                  {t("older")}
                  <Icon icon={IconChevronRight} />
                </Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
