import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { PropertyKind } from "@/lib/api/types";
import { Badge } from "@/ui/components/Badge";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon } from "@/ui/icons";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconWarning } from "@/ui/icons/glyphs/warning";

import { feeDueTone, measuresOf, unitFacts, type FeeStatement, type UnitMeasures } from "./model";
import { periodName } from "./words";

export interface PaperUnit {
  kind: PropertyKind | null;
  measures: UnitMeasures;
}

/**
 * The common fees of one billing period as paper (J-DESIGN §3 *liff-common-fees*, §4 *paper statement*): the juristic
 * person on top, one block per unit — the unit tag in mono, its size in the place's own unit (ตร.ม. / ตร.วา) and its
 * share, the unit's amount — then a double rule and the total with the due date. No eyebrow, no legal footer (§1.6):
 * the paper is the document, nothing decorates it. Amounts are the API's; with several invoices in one period the
 * total is not printed (it would be a sum, contract request #43) and the screen says which unit the pay button pays first.
 */
export async function FeePaper({
  statement,
  units,
  locale,
  today,
  headingId,
  testId = "fee-paper",
}: {
  statement: FeeStatement;
  /** The place's kind and register measures per unit id (CR #42). */
  units: Map<string, PaperUnit>;
  locale: Locale;
  today: string;
  headingId: string;
  testId?: string;
}) {
  const t = await getTranslations("resident.fees");
  const tone = feeDueTone(statement, today);
  const title = t("paper.title", { period: periodName(t, statement.period, locale) });
  return (
    <article
      aria-labelledby={headingId}
      className="rounded-card border-border bg-surface shadow-card border"
      data-testid={testId}
      data-period={statement.period.key}
      data-open={statement.open ? "true" : "false"}
    >
      <header className="flex flex-col gap-0.5 px-5 pt-5 pb-4">
        <h2 id={headingId} className="text-lg font-semibold text-balance">
          {title}
        </h2>
        <p className="text-muted text-sm">{statement.issuers.join(" · ")}</p>
      </header>

      <ul className="border-border mx-5 border-t" aria-label={t("paper.unitsLabel")}>
        {statement.units.map(({ unitId, unitNo, invoice }) => {
          const place = (unitId && units.get(unitId)) || { kind: null, measures: measuresOf(null) };
          const facts = unitFacts(place.kind, place.measures);
          const amount = statement.open ? invoice.balance : invoice.total;
          return (
            <li
              key={invoice.id}
              className="border-border flex flex-col gap-1 border-b border-dashed py-4 last:border-b-0"
              data-testid="fee-unit"
              data-unit={unitNo}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="bg-bg-subtle rounded-thumb px-1.5 py-0.5 font-mono text-sm font-medium">
                    {unitNo}
                  </span>
                  {facts.size ? (
                    <span className="text-sm tabular-nums" data-testid="fee-unit-size">
                      {t(`kind.size.${facts.size.unit}`, { value: facts.size.value })}
                    </span>
                  ) : null}
                </div>
                <MoneyDisplay amount={amount} locale={locale} className="shrink-0 font-medium" />
              </div>
              {facts.share || facts.plot ? (
                <p className="text-muted text-sm tabular-nums" data-testid="fee-unit-share">
                  {facts.share ? t("kind.share", { value: facts.share }) : t("kind.plot", { plot: facts.plot ?? "" })}
                </p>
              ) : null}
              <ul className="text-muted mt-1 flex flex-col gap-0.5 text-sm">
                {invoice.lines
                  .filter((line) => line.sourceType === "common_fee" || line.sourceType === "fund")
                  .map((line) => (
                    <li key={line.lineNo} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">{t(`paper.line.${line.sourceType}`)}</span>
                      <span className="shrink-0 tabular-nums">{formatTHB(line.amount, locale)}</span>
                    </li>
                  ))}
              </ul>
              <Link
                href={`/invoices/${invoice.id}`}
                className="text-primary -ms-1 inline-flex min-h-11 items-center self-start px-1 text-sm font-medium"
              >
                {t("paper.invoice", { number: invoice.number })}
              </Link>
            </li>
          );
        })}
      </ul>

      <footer className="border-border-strong mx-5 flex flex-col gap-2 border-t-[3px] border-double pt-4 pb-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted text-sm">
            {statement.open
              ? t("paper.totalDue", { count: statement.units.length })
              : t("paper.totalPaid", { count: statement.units.length })}
          </span>
          {statement.total ? (
            <MoneyDisplay amount={statement.total} locale={locale} size="lg" className="shrink-0 text-2xl" />
          ) : null}
        </div>
        <DueLine tone={tone} dueDate={statement.dueDate} locale={locale} t={t} />
      </footer>
    </article>
  );
}

function DueLine({
  tone,
  dueDate,
  locale,
  t,
}: {
  tone: ReturnType<typeof feeDueTone>;
  dueDate: string;
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const date = formatDate(dueDate, locale);
  if (tone.tone === "paid") {
    return (
      <span
        className="text-success-subtle-fg inline-flex items-center gap-1.5 text-sm"
        data-testid="fee-due"
        data-tone="paid"
      >
        <Icon icon={IconCheckCircle} />
        {t("due.paid")}
      </span>
    );
  }
  const text =
    tone.tone === "red"
      ? t("due.late", { days: tone.days, date })
      : tone.days === 0
        ? t("due.today", { date })
        : tone.tone === "amber"
          ? t("due.soon", { date, days: tone.days })
          : t("due.on", { date });
  if (tone.tone === "muted") {
    return (
      <span className="text-muted inline-flex items-center gap-1.5 text-sm" data-testid="fee-due" data-tone="muted">
        <Icon icon={IconClock} />
        {text}
      </span>
    );
  }
  // Amber within 7 days, red only once the due date has passed (J-DESIGN §3) — icon and words, never colour alone.
  return (
    <span data-testid="fee-due" data-tone={tone.tone}>
      <Badge tone={tone.tone === "red" ? "danger" : "warning"} icon={tone.tone === "red" ? IconWarning : IconClock}>
        {text}
      </Badge>
    </span>
  );
}
