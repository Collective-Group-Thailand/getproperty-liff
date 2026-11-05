import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ClearanceList } from "@/features/resident/fees/Clearances";
import { billedUnitOr404, loadClearances } from "@/features/resident/fees/data";
import { canRequestClearance } from "@/features/resident/fees/model";
import { unitName } from "@/features/resident/fees/words";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.clearance");
  return { title: t("title") };
}

/** `/units/{unitId}/debt-clearances` — a co-owner's certificates (JL1, D-306; LINE `juristic.debt_clearance.*`). */
export default async function ClearancesPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = await billedUnitOr404(unitId);
  if (!canRequestClearance(unit)) notFound();
  const [t, locale, clearances] = await Promise.all([
    getTranslations("resident.fees"),
    pageLocale(),
    loadClearances(unitId),
  ]);
  return (
    <ResidentShell active="bills" back={{ href: "/fees", label: t("title") }}>
      {clearances.error ? (
        <ProblemPage error={clearances.error} />
      ) : (
        <ClearanceList unitId={unitId} unitName={unitName(t, unit)} clearances={clearances.data} locale={locale} />
      )}
    </ResidentShell>
  );
}
