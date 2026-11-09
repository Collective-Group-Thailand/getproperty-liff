import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { billedUnitOr404, loadPlan } from "@/features/resident/fees/data";
import { PlanRecord } from "@/features/resident/fees/Plans";
import { unitName } from "@/features/resident/fees/words";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.plans");
  return { title: t("title") };
}

/** One payment plan with its instalments (JL1, D-325), read by id (CR #48) — the LINE messages link here. */
export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string; planId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ unitId, planId }, query] = await Promise.all([params, searchParams]);
  const unit = await billedUnitOr404(unitId);
  const [t, locale, loaded] = await Promise.all([
    getTranslations("resident.fees"),
    pageLocale(),
    loadPlan(unitId, planId),
  ]);
  if (loaded.data === null) notFound();
  const plan = loaded.data;
  return (
    <ResidentShell active="bills" back={{ href: `/units/${unitId}/payment-plans`, label: t("plans.title") }}>
      {loaded.error || !plan ? (
        <ProblemPage error={loaded.error!} />
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
