import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { billedUnitOr404, loadPlans } from "@/features/resident/fees/data";
import { PlanRecord } from "@/features/resident/fees/Plans";
import { unitName } from "@/features/resident/fees/words";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.plans");
  return { title: t("title") };
}

/** One payment plan with its instalments (JL1, D-325). The contract has no single-plan read: it comes from the list. */
export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string; planId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ unitId, planId }, query] = await Promise.all([params, searchParams]);
  const unit = await billedUnitOr404(unitId);
  const [t, locale, plans] = await Promise.all([getTranslations("resident.fees"), pageLocale(), loadPlans(unitId)]);
  const plan = plans.data?.find((p) => p.id === planId);
  if (plans.data && !plan) notFound();
  return (
    <ResidentShell active="bills" back={{ href: `/units/${unitId}/payment-plans`, label: t("plans.title") }}>
      {plans.error || !plan ? (
        <ProblemPage error={plans.error!} />
      ) : (
        <PlanRecord
          unitId={unitId}
          unitName={unitName(t, unit)}
          plan={plan}
          locale={locale}
          sent={query.sent === "1"}
        />
      )}
    </ResidentShell>
  );
}
