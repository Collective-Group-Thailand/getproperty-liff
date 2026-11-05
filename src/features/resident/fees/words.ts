import { formatDate, formatPeriodKey } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";

import { kindWords, periodWords, type FeePeriod } from "./model";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** A billing period as people say it — "ปี 2570", "ไตรมาส 2/2570", "ครึ่งปีหลัง 2570", "ต.ค. 2569", or the dates. */
export function periodName(t: Translate, period: FeePeriod, locale: Locale): string {
  const { key, values } = periodWords(period, locale);
  if (period.kind === "month") return t(key, { month: formatPeriodKey(String(values.month), locale) });
  if (period.kind === "range") {
    return t(key, { start: formatDate(period.start, locale), end: formatDate(period.end, locale) });
  }
  return t(key, values);
}

/** "ห้องชุด C-1203", "บ้าน 88/12", "พื้นที่ R-12" — the unit named by the place's kind (J-DESIGN §1.3). */
export function unitName(
  t: Translate,
  unit: { unitNo: string; propertyKind: Parameters<typeof kindWords>[0] },
): string {
  return t(`kind.unit.${kindWords(unit.propertyKind).unit}`, { unit: unit.unitNo });
}
