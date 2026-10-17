import { getTranslations } from "next-intl/server";

import { READING_SOURCE, type ReadingSource } from "@/domain/status/reading";
import { formatDate, formatDateTime, formatTHB, formatUnits } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { InvoiceLineView } from "@/lib/api/contract-requests";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { IconHelp } from "@/ui/icons/glyphs/help";

import { MeterPhoto } from "./MeterPhoto";
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

async function MeterLine({ line, locale }: { line: InvoiceLineView; locale: Locale }) {
  const t = await getTranslations("resident.invoices.lines");
  const root = await getTranslations();
  const unit = meterUnit(line.unit);
  const register = (value: string | null) =>
    value === null ? "—" : formatUnits(value, unit ?? "kWh", locale, { withUnit: false });
  const source = isReadingSource(line.readingSource) ? line.readingSource : null;
  return (
    <li
      className="border-border flex flex-col gap-2 border-b py-3 last:border-b-0"
      data-testid="invoice-line"
      data-kind={line.lineKind}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{line.description}</p>
          {line.periodFrom && line.periodTo ? (
            <p className="text-muted text-xs">
              {t("period", { from: formatDate(line.periodFrom, locale), to: formatDate(line.periodTo, locale) })}
            </p>
          ) : null}
        </div>
        <p className="font-semibold tabular-nums">{formatTHB(line.amount, locale)}</p>
      </div>
      {source ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={READING_SOURCE[source]} label={root(READING_SOURCE[source].labelKey)} size="sm" />
          {line.readAt ? (
            <span className="text-muted text-xs">{t("readAt", { date: formatDateTime(line.readAt, locale) })}</span>
          ) : null}
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm" data-testid="meter-readings">
        <dt className="text-muted">{t("previous")}</dt>
        <dd className="text-end tabular-nums">{register(line.registerFrom)}</dd>
        <dt className="text-muted">{t("current")}</dt>
        <dd className="text-end tabular-nums">{register(line.registerTo)}</dd>
        <dt className="text-muted">{t("used")}</dt>
        <dd className="text-end font-medium tabular-nums">{quantity(line, locale)}</dd>
        {line.unitPrice ? (
          <>
            <dt className="text-muted">{t("pricePerUnit")}</dt>
            <dd className="text-end tabular-nums">{t("rate", { rate: formatRate(line.unitPrice, locale) })}</dd>
          </>
        ) : null}
      </dl>
      {line.unitPrice ? (
        <p className="bg-bg-subtle rounded-control px-3 py-2 text-sm tabular-nums" data-testid="units-times-price">
          {t("unitsTimesPrice", {
            units: quantity(line, locale),
            rate: formatRate(line.unitPrice, locale),
            amount: formatTHB(line.amount, locale),
          })}
        </p>
      ) : null}
      {line.isEstimated ? (
        <p className="text-muted flex flex-wrap items-center gap-2 text-sm" data-testid="line-estimated">
          <Badge tone="warning" size="sm" icon={IconHelp}>
            {t("estimatedBadge")}
          </Badge>
          {t("estimated")}
        </p>
      ) : null}
      {line.readingPhotoUrl ? (
        <MeterPhoto
          url={line.readingPhotoUrl}
          title={line.description}
          caption={line.readAt ? t("readAt", { date: formatDateTime(line.readAt, locale) }) : t("photoCaption")}
        />
      ) : null}
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
