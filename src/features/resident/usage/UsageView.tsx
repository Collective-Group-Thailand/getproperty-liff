import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatUnits, TIME_ZONE, type MeterUnit } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ResidentUsage, UtilityUsage } from "@/lib/api/types";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconElectric } from "@/ui/icons/glyphs/electric";
import { IconWater } from "@/ui/icons/glyphs/water";

import { alignByPosition, USAGE_RANGES, type UsageRange, type UsageWindow } from "./range";
import { UsageFigure } from "./UsageFigure";

/** The API's period totals and the "so far this billing cycle" estimate per utility (`ResidentUsageDto.summary`). */
export type UsageSummary = ResidentUsage["summary"][number];

const unitOf = (unit: "kwh" | "m3"): MeterUnit => (unit === "kwh" ? "kWh" : "m3");

function bucketLabel(iso: string, bucket: "1h" | "1d", locale: Locale): string {
  if (bucket === "1d") return formatDate(iso, locale, { style: "dayMonth" });
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * Electricity and water use of the resident's unit (L3 3.3, D-063, D-162): one chart per utility for the chosen
 * period with the previous period beside it, a data table for each chart, the API's period totals and the cycle
 * estimate (only utilities with telemetry have one), and tips. Quantities stay the API's decimal strings.
 */
export async function UsageView({
  range,
  window,
  current,
  previous,
  locale,
}: {
  range: UsageRange;
  window: UsageWindow;
  current: ResidentUsage;
  previous: ResidentUsage | null;
  locale: Locale;
}) {
  const t = await getTranslations("resident.usage");
  if (current.series.length === 0) {
    return <ManualReadings />;
  }

  return (
    <div className="flex flex-col gap-4 py-5" data-testid="usage-view">
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      <nav aria-label={t("rangeLabel")}>
        <ul className="bg-bg-subtle rounded-control grid grid-cols-3 gap-1 p-1" role="list">
          {USAGE_RANGES.map((value) => (
            <li key={value}>
              <Link
                href={`/usage?range=${value}`}
                aria-current={value === range ? "page" : undefined}
                className="rounded-control aria-[current=page]:bg-surface aria-[current=page]:shadow-card flex min-h-12 items-center justify-center text-sm font-medium"
                data-testid={`usage-range-${value}`}
              >
                {t(`range.${value}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {current.series.map((series) => (
        <UtilityCard
          key={series.utility}
          series={series}
          previous={previous?.series.find((s) => s.utility === series.utility) ?? null}
          summary={current.summary.find((s) => s.utility === series.utility) ?? null}
          window={window}
          range={range}
          locale={locale}
        />
      ))}

      <Card as="section" padding="md" aria-labelledby="tips-title">
        <h2 id="tips-title" className="font-semibold">
          {t("tips.title")}
        </h2>
        <ul className="text-muted mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
          {(["fridge", "aircon", "standby", "shower"] as const).map((tip) => (
            <li key={tip}>{t(`tips.${tip}`)}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

async function UtilityCard({
  series,
  previous,
  summary,
  window,
  range,
  locale,
}: {
  series: UtilityUsage;
  previous: UtilityUsage | null;
  summary: UsageSummary | null;
  window: UsageWindow;
  range: UsageRange;
  locale: Locale;
}) {
  const t = await getTranslations("resident.usage");
  const unit = unitOf(series.unit);
  const now = alignByPosition(series.points, window.current.from, window.bucket, window.buckets);
  const before = previous
    ? alignByPosition(previous.points, window.previous.from, window.bucket, window.buckets)
    : now.map(() => null);
  const labels = now.map((_, index) => {
    const start = Date.parse(window.current.from) + index * (window.bucket === "1h" ? 3_600_000 : 86_400_000);
    return bucketLabel(new Date(start).toISOString(), window.bucket, locale);
  });
  const shown = (value: string | null | undefined) => (value == null ? "—" : formatUnits(value, unit, locale));
  const name = t(`utility.${series.utility}`);
  const titleId = `usage-${series.utility}-title`;

  return (
    <Card as="section" padding="md" aria-labelledby={titleId} data-testid={`usage-${series.utility}`}>
      <h2 id={titleId} className="flex items-center gap-2 font-semibold">
        <Icon icon={series.utility === "electric" ? IconElectric : IconWater} />
        {name}
      </h2>
      {summary ? (
        <dl className="mt-2 grid grid-cols-2 gap-2" data-testid={`usage-summary-${series.utility}`}>
          <div>
            <dt className="text-muted text-xs">{t("summary.current")}</dt>
            <dd className="text-lg font-semibold tabular-nums">{shown(summary.total)}</dd>
          </div>
          {summary.previousTotal ? (
            <div>
              <dt className="text-muted text-xs">{t("summary.previous")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{shown(summary.previousTotal)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {summary?.cycleToDate ? (
        <div className="mt-3" data-testid={`usage-estimate-${series.utility}`}>
          <Callout tone="info">
            {t(summary.cycleToDate.estimated ? "summary.cycleEstimated" : "summary.cycle", {
              usage: shown(summary.cycleToDate.usage),
              date: formatDate(summary.cycleToDate.from, locale),
            })}
          </Callout>
        </div>
      ) : null}
      <div className="mt-3">
        <UsageFigure
          tone={series.utility}
          rows={now.map((point, index) => ({
            label: labels[index]!,
            current: point?.usage ?? null,
            previous: before[index]?.usage ?? null,
          }))}
          table={now.map((point, index) => ({
            label: labels[index]!,
            current: shown(point?.usage),
            previous: shown(before[index]?.usage),
          }))}
          firstLabel={labels[0] ?? ""}
          lastLabel={labels[labels.length - 1] ?? ""}
          labels={{
            chart: t("chartLabel", { utility: name, period: t(`range.${range}`) }),
            current: t(`series.current.${range}`),
            previous: t(`series.previous.${range}`),
            showTable: t("showTable"),
            hideTable: t("hideTable"),
            period: window.bucket === "1h" ? t("hour") : t("day"),
            caption: t("tableCaption", { utility: name, unit: unit === "kWh" ? "kWh" : "m³" }),
          }}
        />
      </div>
    </Card>
  );
}

/** No IoT meter serves the unit (D-063): readings are taken by hand once a month, so there is no daily chart. */
export async function ManualReadings() {
  const t = await getTranslations("resident.usage.manual");
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="usage-manual">
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      <Callout tone="neutral">{t("body")}</Callout>
      <p className="text-muted text-sm">{t("bills")}</p>
    </div>
  );
}
