import { useTranslations } from "next-intl";

import { formatPeriodKey } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";
import { Badge } from "@/ui/components/Badge";

type MonthStatus = Schemas["RentRecordMonthStatus"];

const TONE = { on_time: "success", late: "warning", outstanding: "danger" } as const satisfies {
  [K in MonthStatus]: "success" | "warning" | "danger";
};

/** My rent record as facts (D-256): on time / late / outstanding, then each month — never a score. */
export function RentRecordFacts({ record, locale }: { record: Schemas["RentRecordDto"]; locale: Locale }) {
  const t = useTranslations("rentRecord");
  const counts: { key: MonthStatus; value: number }[] = [
    { key: "on_time", value: record.onTime },
    { key: "late", value: record.late },
    { key: "outstanding", value: record.outstanding },
  ];
  return (
    <div className="flex flex-col gap-4" data-testid="rent-record">
      <dl className="grid grid-cols-3 gap-2">
        {counts.map((c) => (
          <div
            key={c.key}
            className="bg-bg-subtle rounded-card flex flex-col gap-1 p-3"
            data-testid={`rent-record-${c.key}`}
          >
            <dt className="text-muted text-xs">{t(`status.${c.key}`)}</dt>
            <dd className="text-xl font-semibold tabular-nums">{t("months", { count: c.value })}</dd>
          </div>
        ))}
      </dl>
      {record.months.length ? (
        <ul className="flex flex-wrap gap-2" role="list" aria-label={t("monthsLabel")}>
          {record.months.map((m) => (
            <li key={m.month} data-status={m.status}>
              <Badge tone={TONE[m.status]} size="sm">
                {formatPeriodKey(m.month, locale)} · {t(`status.${m.status}`)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-sm" data-testid="rent-record-empty">
          {t("empty")}
        </p>
      )}
      {record.notConfirmed > 0 ? (
        <p className="text-muted text-xs">{t("notConfirmed", { count: record.notConfirmed })}</p>
      ) : null}
    </div>
  );
}
