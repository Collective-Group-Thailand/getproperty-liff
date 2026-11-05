import { getTranslations } from "next-intl/server";

import { billedUnitOr404 } from "@/features/resident/fees/data";
import { PlanRequestForm } from "@/features/resident/fees/PlanRequestForm";
import { unitName } from "@/features/resident/fees/words";
import { bangkokToday } from "@/features/resident/invoices/model";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { Screen, ScreenHeader } from "@/features/shared/Screen";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.plans.form");
  return { title: t("title") };
}

/** `/units/{unitId}/payment-plans/new` — ask the office for a payment plan (JL1, D-325). */
export default async function PlanRequestPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = await billedUnitOr404(unitId);
  const [t, form] = await Promise.all([getTranslations("resident.fees"), getTranslations("resident.fees.plans.form")]);
  return (
    <ResidentShell active="bills" back={{ href: `/units/${unitId}/payment-plans`, label: t("plans.title") }}>
      <Screen testId="plan-request">
        <ScreenHeader title={form("title")} lede={form("lede", { unit: unitName(t, unit) })} flush />
        <PlanRequestForm unitId={unitId} today={bangkokToday()} />
      </Screen>
    </ResidentShell>
  );
}
