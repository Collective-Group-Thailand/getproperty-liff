import { getTranslations } from "next-intl/server";

import { READING_SOURCE, type ReadingSource } from "@/domain/status/reading";
import { formatDate, formatDateTime, formatTHB, formatUnits } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { InvoiceLineView } from "@/lib/api/types";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { IconHelp } from "@/ui/icons/glyphs/help";

import { MeterDetails } from "./MeterPhoto";
import { formatRate, groupLines, isMeterLine, meterUnit } from "./model";

function isReadingSource(value: string | null): value is ReadingSource {
  return value !== null && value in READING_SOURCE;
}

/** A quantity with its unit when the API names a metered one, else the bare decimal (trailing zeros trimmed). */
function quantity(line: InvoiceLineView, locale: Locale): string {
  const unit = meterUnit(line.unit);
  return unit
    ? formatUnits(line.quantity, unit, locale)
    : formatUnits(line.quantity, "kWh", locale, { withUnit: false });
}

/**
 * A meter line (D-022): the charge and its amount, then ONE muted line with everything the resident must be able to
 * check — previous → current register, units used × price per unit — and the reading's source (D-012). The labelled
 * readings, the units × price = amount sum, when it was read and the register photo sit one tap away in a sheet
 * (`MeterDetails`), whose trigger is the photo's thumbnail when there is one.
 */
async function MeterLine({ line, locale }: { line: InvoiceLineView; locale: Locale }) {
  const t = await getTranslations("resident.invoices.lines");
  const root = await getTranslations();
  const unit = meterUnit(line.unit);
  const register = (value: string | null) =>
    value === null ? "—" : formatUnits(value, unit ?? "kWh", locale, { withUnit: false });
  const source = isReadingSource(line.readingSource) ? line.readingSource : null;
  const used = quantity(line, locale);
  const rate = line.unitPrice ? formatRate(line.unitPrice, locale) : null;
  const details = (
    <MeterDetails
      title={line.description}
      photoUrl={line.readingPhotoUrl}
      facts={[
        { key: "previous", label: t("previous"), value: register(line.registerFrom) },
        { key: "current", label: t("current"), value: register(line.registerTo) },
        { key: "used", label: t("used"), value: used },
        ...(rate ? [{ key: "rate", label: t("pricePerUnit"), value: t("rate", { rate }) }] : []),
        ...(source ? [{ key: "source", label: t("source"), value: root(READING_SOURCE[source].labelKey) }] : []),
        ...(line.periodFrom && line.periodTo
          ? [
              {
                key: "period",
                label: t("periodLabel"),
                value: t("period", {
                  from: formatDate(line.periodFrom, locale),
                  to: formatDate(line.periodTo, locale),
                }),
              },
            ]
          : []),
      ]}
      formula={rate ? t("unitsTimesPrice", { units: used, rate, amount: formatTHB(line.amount, locale) }) : undefined}
      note={
        line.isEstimated
          ? t("estimated")
          : line.readAt
            ? t("readAt", { date: formatDateTime(line.readAt, locale) })
            : undefined
      }
    />
  );
  const summary = [
    line.registerFrom !== null || line.registerTo !== null
      ? t("registers", { from: register(line.registerFrom), to: register(line.registerTo) })
      : null,
    rate ? t("usedTimesRate", { units: used, rate }) : t("usedOnly", { units: used }),
  ].filter(Boolean);
  return (
    <li
      className="border-border flex flex-col gap-1 border-b py-3 last:border-b-0"
      data-testid="invoice-line"
      data-kind={line.lineKind}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium">{line.description}</p>
        <p className="font-semibold tabular-nums">{formatTHB(line.amount, locale)}</p>
      </div>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-muted text-sm tabular-nums" data-testid="meter-readings">
            {summary.join(" · ")}
          </p>
          <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="flex flex-wrap items-center gap-1.5">
              {source ? (
                <StatusBadge status={READING_SOURCE[source]} label={root(READING_SOURCE[source].labelKey)} size="sm" />
              ) : null}
              {line.isEstimated ? (
                <span data-testid="line-estimated">
                  <Badge tone="warning" size="sm" icon={IconHelp}>
                    {t("estimatedBadge")}
                  </Badge>
                </span>
              ) : null}
            </p>
            {line.readingPhotoUrl ? null : details}
          </div>
        </div>
        {line.readingPhotoUrl ? details : null}
      </div>
    </li>
  );
}

async function PlainLine({ line, locale }: { line: InvoiceLineView; locale: Locale }) {
  const t = await getTranslations("resident.invoices.lines");
  const showQuantity = line.unitPrice !== null && !/^1(\.0+)?$/.test(line.quantity);
  return (
    <li
      className="border-border flex items-start justify-between gap-3 border-b py-3 last:border-b-0"
      data-testid="invoice-line"
      data-kind={line.lineKind}
    >
      <div className="min-w-0">
        <p className="font-medium">{line.description}</p>
        {line.periodFrom && line.periodTo ? (
          <p className="text-muted text-xs">
            {t("period", { from: formatDate(line.periodFrom, locale), to: formatDate(line.periodTo, locale) })}
          </p>
        ) : null}
        {showQuantity && line.unitPrice ? (
          <p className="text-muted text-xs tabular-nums">
            {t("quantityTimesPrice", { quantity: quantity(line, locale), rate: formatRate(line.unitPrice, locale) })}
          </p>
        ) : null}
      </div>
      <p className="font-semibold tabular-nums">{formatTHB(line.amount, locale)}</p>
    </li>
  );
}

/**
 * The invoice's lines grouped by where they come from (rent, meters, services, common fee, fund, penalties,
 * deposit, adjustments). Meter lines disclose what D-022 requires: previous and current reading, the reading's
 * source (D-012), the units used, the price per unit and the amount — and the photo of the register when there is
 * one. Every figure is the API's string.
 */
export async function InvoiceLines({ lines, locale }: { lines: InvoiceLineView[]; locale: Locale }) {
  const t = await getTranslations("resident.invoices.lines");
  return (
    <div className="flex flex-col gap-4" data-testid="invoice-lines">
      {groupLines(lines).map(({ group, lines: groupLinesOf }) => (
        <section key={group} aria-labelledby={`lines-${group}`} data-group={group}>
          <h3 id={`lines-${group}`} className="text-muted text-sm font-semibold">
            {t(`groups.${group}`)}
          </h3>
          <ul>
            {groupLinesOf.map((line) =>
              isMeterLine(line) ? (
                <MeterLine key={line.lineNo} line={line} locale={locale} />
              ) : (
                <PlainLine key={line.lineNo} line={line} locale={locale} />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
