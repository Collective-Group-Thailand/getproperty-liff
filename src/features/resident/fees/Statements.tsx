import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { List, PaperDocument, Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { formatDate, formatPeriodKey, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { PageMeta, Statement } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/EmptyState";
import { Statement as StatementTable } from "@/ui/components/Statement";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconChevronLeft } from "@/ui/icons/glyphs/chevron-left";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

import { DocumentControl } from "./DocumentControl";
import { periodOf } from "./model";
import { periodName } from "./words";
import { isZero as isZeroAmount } from "@/features/resident/invoices/model";

/**
 * Monthly statements (J1.2b, D-307, D-326): newest month first, one row each — the month, the number, what is to pay
 * now ("ยอดที่ต้องชำระ") and the units it covers. Firm, never shaming: nothing due reads "ไม่มียอดที่ต้องชำระ".
 */
export async function StatementList({
  items,
  meta,
  page,
  locale,
}: {
  items: Statement[];
  meta: PageMeta;
  page: number;
  locale: Locale;
}) {
  const t = await getTranslations("resident.fees.statements");
  const hasOlder = page * meta.perPage < meta.total;
  return (
    <Screen testId="statement-list">
      <ScreenHeader title={t("title")} lede={t("lede")} flush />
      {items.length === 0 ? (
        <EmptyState
          variant="card"
          icon={IconBill}
          title={t("empty")}
          description={t("emptyBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/fees">{t("toFees")}</Link>
            </Button>
          }
        />
      ) : (
        <List
          label={t("title")}
          testId="statement-rows"
          rows={items.map((statement) => ({
            key: statement.id,
            href: `/statements/${statement.id}`,
            icon: IconBill,
            title: formatPeriodKey(statement.period, locale),
            meta: (
              <>
                <span className="font-mono">{statement.number}</span>
                {" · "}
                {statement.units.map((u) => u.unitNo).join(", ")}
              </>
            ),
            end: isZeroAmount(statement.amountDue) ? undefined : formatTHB(statement.amountDue, locale),
            endMeta: isZeroAmount(statement.amountDue) ? (
              <span className="text-muted">{t("nothingDue")}</span>
            ) : (
              <span className="text-muted">{t("toPay")}</span>
            ),
            testId: "statement-row",
          }))}
        />
      )}
      {page > 1 || hasOlder ? (
        <nav className="flex items-center justify-between gap-3" aria-label={t("pages")}>
          {page > 1 ? (
            <Button asChild variant="ghost" iconStart={IconChevronLeft}>
              <Link href={`/statements?page=${page - 1}`}>{t("newer")}</Link>
            </Button>
          ) : (
            <span />
          )}
          {hasOlder ? (
            <Button asChild variant="ghost" iconEnd={IconChevronRight}>
              <Link href={`/statements?page=${page + 1}`}>{t("older")}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </Screen>
  );
}

/**
 * One statement as paper (the page the API's LINE message `juristic.statement.ready` opens, `/statements/{id}`):
 * brought forward, charges, credits, payments, closing — then what is to pay now with the open invoices behind it, and
 * the PDF (outlined). Figures are the API's; the table only lays them out (rules, double rule under the result).
 */
export async function StatementPaper({ statement, locale }: { statement: Statement; locale: Locale }) {
  const t = await getTranslations("resident.fees.statements");
  const fees = await getTranslations("resident.fees");
  const money = (value: string) => formatTHB(value, locale);
  const due = !isZeroAmount(statement.amountDue);
  return (
    <Screen testId="statement">
      <PaperDocument
        labelledBy="statement-title"
        testId="statement-paper"
        issuer={statement.units
          .map((u) => u.building)
          .filter((b, i, all) => all.indexOf(b) === i)
          .join(" · ")}
        kind={t("paperTitle", { month: formatPeriodKey(statement.period, locale) })}
        number={statement.number}
        facts={[
          { key: "to", label: t("to"), value: statement.partyName },
          { key: "units", label: t("units"), value: statement.units.map((u) => u.unitNo).join(", ") },
          { key: "issued", label: t("issued"), value: formatDate(statement.issuedAt, locale) },
          {
            key: "period",
            label: t("period"),
            value: `${formatDate(statement.periodStart, locale, { style: "dayMonth" })} – ${formatDate(statement.periodEnd, locale)}`,
          },
        ]}
      >
        <StatementTable
          caption={t("paperTitle", { month: formatPeriodKey(statement.period, locale) })}
          lines={[
            { key: "opening", label: t("opening"), value: money(statement.opening) },
            { key: "charges", label: t("charges"), value: money(statement.charges), level: 1 },
            { key: "credits", label: t("credits"), value: money(statement.credits), level: 1 },
            { key: "payments", label: t("payments"), value: money(statement.payments), level: 1 },
            { key: "closing", label: t("closing"), value: money(statement.closing), kind: "subtotal" },
            {
              key: "due",
              label: t("amountDue"),
              value: money(statement.amountDue),
              kind: "result",
              testId: "statement-amount-due",
            },
          ]}
        />
      </PaperDocument>

      {statement.openInvoices.length ? (
        <Section title={t("openTitle")} titleId="statement-open-title" testId="statement-open">
          <List
            rows={statement.openInvoices.map((invoice) => ({
              key: invoice.id,
              href: `/invoices/${invoice.id}`,
              icon: IconBill,
              title: (
                <>
                  {invoice.unitNo ? <span className="font-mono">{invoice.unitNo}</span> : null}
                  {invoice.unitNo ? " · " : null}
                  {periodName(fees, periodOf(invoice.periodStart, invoice.periodEnd), locale)}
                </>
              ),
              meta: invoice.dueDate ? t("dueOn", { date: formatDate(invoice.dueDate, locale) }) : invoice.number,
              end: money(invoice.balance),
            }))}
          />
        </Section>
      ) : null}

      <div className="flex flex-col gap-2">
        {due ? (
          <Button asChild size="xl" block>
            <Link href="/fees" data-testid="statement-pay">
              {t("payNow")}
            </Link>
          </Button>
        ) : (
          <p className="text-muted text-sm" data-testid="statement-settled">
            {t("nothingDueBody")}
          </p>
        )}
        <DocumentControl target={{ kind: "statement", id: statement.id }} label={t("pdf")} testId="statement-pdf" />
      </div>
    </Screen>
  );
}
