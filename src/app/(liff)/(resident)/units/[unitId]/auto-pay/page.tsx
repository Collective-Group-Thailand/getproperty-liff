import { getTranslations } from "next-intl/server";

import { AutoPay } from "@/features/resident/fees/AutoPay";
import { billedUnitOr404, loadMandates } from "@/features/resident/fees/data";
import { unitName } from "@/features/resident/fees/words";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { Screen, ScreenHeader } from "@/features/shared/Screen";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.autopay");
  return { title: t("title") };
}

/** `/units/{unitId}/auto-pay` — auto-pay for the advance common-fee bills of this unit (JL1, D-308, D-325). */
export default async function AutoPayPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = await billedUnitOr404(unitId);
  const [t, locale, mandates] = await Promise.all([
    getTranslations("resident.fees"),
    pageLocale(),
    loadMandates(unitId),
  ]);
  return (
    <ResidentShell active="bills" back={{ href: "/fees", label: t("title") }}>
      {mandates.error ? (
        <ProblemPage error={mandates.error} />
      ) : (
        <Screen testId="autopay">
          <ScreenHeader title={t("autopay.title")} lede={t("autopay.lede", { unit: unitName(t, unit) })} flush />
          <AutoPay
            unitId={unitId}
            mandates={mandates.data}
            locale={locale}
            initialUnavailable={!unit.recurringAvailable}
          />
        </Screen>
      )}
    </ResidentShell>
  );
}
