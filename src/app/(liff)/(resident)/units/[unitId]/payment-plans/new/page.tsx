import { getTranslations } from "next-intl/server";

import { billedUnitOr404, loadPlanOptions } from "@/features/resident/fees/data";
import { PlanRequestForm } from "@/features/resident/fees/PlanRequestForm";
import { unitName } from "@/features/resident/fees/words";
import { bangkokToday } from "@/features/resident/invoices/model";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { EmptyAction } from "@/features/shared/EmptyAction";
import { Screen, ScreenHeader } from "@/features/shared/Screen";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.plans.form");
  return { title: t("title") };
}

/**
 * `/units/{unitId}/payment-plans/new` — ask the office for a payment plan (JL1, D-325). The request options (CR #45)
 * give the office's range and what would be split now; nothing to split → a calm card instead of the form. Options
 * that cannot be read leave the form to the contract's minimum and the API's 422.
 */
export default async function PlanRequestPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = await billedUnitOr404(unitId);
  const [t, form, options] = await Promise.all([
    getTranslations("resident.fees"),
    getTranslations("resident.fees.plans.form"),
    loadPlanOptions(unitId),
  ]);
  return (
    <ResidentShell active="bills" back={{ href: `/units/${unitId}/payment-plans`, label: t("plans.title") }}>
      <Screen testId="plan-request">
        <ScreenHeader title={form("title")} lede={form("lede", { unit: unitName(t, unit) })} flush />
        {options.data && !options.data.available ? (
          <div data-testid="plan-nothing-due">
            <Callout
              tone="success"
              title={form("nothingDue")}
              action={<EmptyAction href="/fees" label={t("plans.toFees")} />}
            >
              {form("nothingDueBody")}
            </Callout>
          </div>
        ) : (
          <PlanRequestForm unitId={unitId} today={bangkokToday()} options={options.data ?? null} />
        )}
      </Screen>
    </ResidentShell>
  );
}
