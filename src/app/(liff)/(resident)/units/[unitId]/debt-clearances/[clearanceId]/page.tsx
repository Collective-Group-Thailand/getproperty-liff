import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { CertificateView } from "@/features/resident/fees/CertificateView";
import { billedUnitOr404, loadClearances } from "@/features/resident/fees/data";
import { unitName } from "@/features/resident/fees/words";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { Screen, ScreenHeader } from "@/features/shared/Screen";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.clearance");
  return { title: t("title") };
}

/** One certificate or request (JL1, D-306); the contract has no single read, so it comes from the unit's list. */
export default async function ClearancePage({ params }: { params: Promise<{ unitId: string; clearanceId: string }> }) {
  const { unitId, clearanceId } = await params;
  const unit = await billedUnitOr404(unitId);
  const [t, locale, clearances] = await Promise.all([
    getTranslations("resident.fees"),
    pageLocale(),
    loadClearances(unitId),
  ]);
  const clearance = clearances.data?.find((c) => c.id === clearanceId);
  if (clearances.data && !clearance) notFound();
  return (
    <ResidentShell active="bills" back={{ href: `/units/${unitId}/debt-clearances`, label: t("clearance.title") }}>
      {clearances.error || !clearance ? (
        <ProblemPage error={clearances.error!} />
      ) : (
        <Screen testId="clearance-record">
          <ScreenHeader title={t("clearance.title")} lede={unitName(t, unit)} flush />
          <CertificateView clearance={clearance} unitName={unitName(t, unit)} locale={locale} />
        </Screen>
      )}
    </ResidentShell>
  );
}
