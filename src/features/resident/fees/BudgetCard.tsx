import { getTranslations } from "next-intl/server";

import { formatDate, formatPercent, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { BudgetActual } from "@/lib/api/types";
import { Card } from "@/ui/components/Card";
import { Progress } from "@/ui/components/Progress";
import { Icon } from "@/ui/icons";
import { IconChart } from "@/ui/icons/glyphs/chart";

import { barWidth, eraYear } from "./model";

/**
 * This year's budget (D-304, D-326: residents see budget vs actual) — one card, one thin bar. The API publishes the
 * income side until J2.1 (`expenseSideAvailable` false), so the card says what it is: the income the meeting approved
 * against what has been billed so far — never "used", which would claim spending the API has not reported. The bar is
 * the API's own percentage. The link to the resolution waits for the API (contract request #46): no dead link meanwhile.
 */
export async function BudgetCard({ budget, locale }: { budget: BudgetActual; locale: Locale }) {
  const t = await getTranslations("resident.fees.budget");
  const width = barWidth(budget.billedVsBudgetPct);
  const usedWord = budget.expenseSideAvailable ? "spent" : "billed";
  return (
    <Card as="section" aria-labelledby="fees-budget-title" padding="none" data-testid="fees-budget">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 id="fees-budget-title" className="flex items-center gap-2 font-semibold">
          <span className="bg-bg-subtle rounded-thumb text-muted grid size-8 place-items-center" aria-hidden="true">
            <Icon icon={IconChart} />
          </span>
          {t("title")}
        </h2>
        <span className="bg-bg-subtle rounded-thumb px-2 py-0.5 text-sm font-medium tabular-nums">
          {t("year", { year: eraYear(budget.fiscalYear, locale) })}
        </span>
      </div>
      <dl className="flex flex-col gap-1.5 px-5 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted text-sm">{t("approved")}</dt>
          <dd className="tabular-nums">{formatTHB(budget.budgetedIncome, locale)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted text-sm">{t(usedWord)}</dt>
          <dd className="font-semibold tabular-nums">
            {formatTHB(budget.billed, locale)}
            {budget.billedVsBudgetPct ? (
              <span className="text-primary ms-1.5 font-medium">
                {t("pct", { value: formatPercent(budget.billedVsBudgetPct, locale, 0) })}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
      {width !== null ? (
        <Progress
          className="mx-5 mt-3"
          size="sm"
          value={width}
          max={100}
          label={t(usedWord)}
          valueText={formatPercent(budget.billedVsBudgetPct ?? "0", locale, 0)}
          showCaption={false}
        />
      ) : null}
      <p className="text-muted border-border mx-5 mt-4 border-t py-3 text-sm">
        {t("asOf", {
          date: formatDate(budget.asOf, locale),
          from: formatDate(budget.periodStart, locale, { style: "month" }),
          to: formatDate(budget.periodEnd, locale, { style: "month" }),
        })}
      </p>
    </Card>
  );
}
