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
import { List, Screen, ScreenHeader, Section, SectionLink } from "@/features/shared/Screen";
import { EmptyState } from "@/ui/components/EmptyState";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon } from "@/ui/icons";
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
  lead,
}: {
  invoice: InvoiceView;
  locale: Locale;
  today: string;
  showUnit: boolean;
  vapidKey?: string;
  /** The first open invoice carries the screen's one filled pay button; the others are outlined. */
  lead: boolean;
}) {
  const t = await getTranslations("resident.invoices.list");
  const root = await getTranslations();
  const state = dueState(invoice, today);
  return (
    <Card as="li" padding="none" className="flex flex-col" data-testid="open-invoice" data-invoice={invoice.id}>
      <Link href={`/invoices/${invoice.id}`} className="flex items-start justify-between gap-3 px-4 pt-4 pb-1">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 font-semibold">
            {t("period", { period: formatDate(invoice.periodStart, locale, { style: "month" }) })}
            <Icon icon={IconChevronRight} className="text-subtle rtl:rotate-180" />
          </span>
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
      </Link>
      <div className="flex flex-col gap-1 px-4 pb-4">
        <MoneyDisplay
          amount={invoice.balance}
          locale={locale}
          size="lg"
          tone={needsAttention(state) ? "attention" : "default"}
        />
        <Due state={state} dueDate={invoice.dueDate} locale={locale} />
        <PayLauncher
          invoice={invoice}
          label={t("pay")}
          size="lg"
          variant={lead ? "primary" : "secondary"}
          className="mt-3"
          testId="open-invoice-pay"
          vapidKey={vapidKey}
        />
      </div>
    </Card>
  );
}

/**
 * Invoices (L2 2.1 §2): what is still to pay first — the one due soonest on top, each with its amount, due date in
 * words and a pay button — then the history by billing period (newest first, paged like the API). Receipts are one
 * tap away. With several units the unit is named on each invoice, and (JRL) a unit filter narrows the list to one of
 * them (`?unit=` → the API's `unitId`) — all my units by default, so a bill is never hidden behind the unit switcher.
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
  unitFilter,
}: {
  /** JRL: the units to filter by (two or more) and the one chosen (`null` = all). */
  unitFilter?: { units: { unitId: string; unitNo: string }[]; current: string | null };
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
  const unitParam = unitFilter?.current ? `unit=${encodeURIComponent(unitFilter.current)}` : "";
  const pageHref = (target: number) => {
    const query = [target > 1 ? `page=${target}` : "", unitParam].filter(Boolean).join("&");
    return query ? `/invoices?${query}` : "/invoices";
  };

  return (
    <Screen testId="invoice-list">
      <ScreenHeader title={t("title")} />

      {unitFilter && unitFilter.units.length > 1 ? (
        <nav aria-label={t("unitFilter.label")} data-testid="invoice-unit-filter">
          <ul className="bg-bg-subtle rounded-control relative flex gap-1 overflow-x-auto p-1" role="list">
            {[
              { unitId: null, label: t("unitFilter.all", { count: unitFilter.units.length }) },
              ...unitFilter.units.map((u) => ({ unitId: u.unitId, label: t("unitFilter.unit", { unit: u.unitNo }) })),
            ].map((option) => (
              <li key={option.unitId ?? "all"} className="min-w-0 flex-1">
                <Link
                  href={option.unitId ? `/invoices?unit=${encodeURIComponent(option.unitId)}` : "/invoices"}
                  aria-current={option.unitId === unitFilter.current ? "page" : undefined}
                  className="rounded-control aria-[current=page]:bg-surface aria-[current=page]:shadow-card flex min-h-12 items-center justify-center px-3 text-sm font-medium whitespace-nowrap"
                  data-testid="invoice-unit-option"
                >
                  {option.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {page === 1 ? (
        <Section title={t("openTitle")} titleId="open-title">
          {open.length ? (
            <ul className="flex flex-col gap-3">
              {open.map((invoice, index) => (
                <OpenInvoice
                  key={invoice.id}
                  invoice={invoice}
                  locale={locale}
                  today={today}
                  showUnit={showUnit}
                  vapidKey={vapidKey}
                  lead={index === 0}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              variant="card"
              icon={IconCheckCircle}
              title={t("nothingDue")}
              description={t("nothingDueBody")}
              action={
                <Button asChild variant="secondary">
                  <Link href="/receipts">{t("receipts")}</Link>
                </Button>
              }
            />
          )}
        </Section>
      ) : null}

      <Section
        title={t("historyTitle")}
        titleId="history-title"
        action={
          <SectionLink href="/receipts" testId="to-receipts">
            {t("receipts")}
          </SectionLink>
        }
      >
        {past.length === 0 ? (
          <p className="text-muted text-sm">{t("noHistory")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {byPeriod(past).map(([period, invoices]) => (
              <div key={period} className="flex flex-col gap-2" data-testid="history-period" data-period={period}>
                <h3 className="text-muted text-xs font-semibold">
                  {formatDate(`${period}-01`, locale, { style: "month" })}
                </h3>
                <List
                  rows={invoices.map((invoice) => ({
                    key: invoice.id,
                    href: `/invoices/${invoice.id}`,
                    testId: "history-invoice",
                    title: <span className="font-mono text-sm">{invoice.number}</span>,
                    meta: showUnit
                      ? t("issuerUnit", { issuer: invoice.issuerName, unit: invoice.unitNo ?? "—" })
                      : invoice.issuerName,
                    end: formatTHB(invoice.amountDue, locale),
                    endMeta: (
                      <StatusBadge
                        status={INVOICE_STATUS[invoice.status]}
                        label={root(INVOICE_STATUS[invoice.status].labelKey)}
                        size="sm"
                      />
                    ),
                  }))}
                />
              </div>
            ))}
          </div>
        )}
        {page > 1 || hasOlder ? (
          <nav aria-label={t("pages")} className="flex justify-between gap-2">
            {page > 1 ? (
              <Button asChild variant="ghost" size="lg" iconStart={IconChevronLeft}>
                <Link href={pageHref(page - 1)}>{t("newer")}</Link>
              </Button>
            ) : (
              <span />
            )}
            {hasOlder ? (
              <Button asChild variant="ghost" size="lg">
                <Link href={pageHref(page + 1)}>
                  {t("older")}
                  <Icon icon={IconChevronRight} />
                </Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </Section>
    </Screen>
  );
}
