import { getTranslations } from "next-intl/server";

import { billedUnitOr404, loadPlans } from "@/features/resident/fees/data";
import { PlanList } from "@/features/resident/fees/Plans";
import { unitName } from "@/features/resident/fees/words";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.plans");
  return { title: t("title") };
}

/** `/units/{unitId}/payment-plans` — my plans on this unit (JL1, D-325; the LINE messages `juristic.payment_plan.*`). */
export default async function PlansPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = await billedUnitOr404(unitId);
  const [t, locale, plans] = await Promise.all([getTranslations("resident.fees"), pageLocale(), loadPlans(unitId)]);
  return (
    <ResidentShell active="bills" back={{ href: "/fees", label: t("title") }}>
      {plans.error ? (
        <ProblemPage error={plans.error} />
      ) : (
        <PlanList unitId={unitId} unitName={unitName(t, unit)} plans={plans.data} locale={locale} />
      )}
    </ResidentShell>
  );
}
