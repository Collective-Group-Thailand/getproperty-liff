import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ClearanceRequest } from "@/features/resident/fees/ClearanceRequest";
import { billedUnitOr404 } from "@/features/resident/fees/data";
import { canRequestClearance } from "@/features/resident/fees/model";
import { unitName } from "@/features/resident/fees/words";
import { bangkokToday } from "@/features/resident/invoices/model";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { Screen, ScreenHeader } from "@/features/shared/Screen";
import { serverEnv } from "@/lib/env";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.clearance.form");
  return { title: t("title") };
}

/** The contract's window for `asOf`: today … +60 days (`DebtClearanceRequestDto.asOf`). */
const AS_OF_WINDOW_DAYS = 60;

/** `/units/{unitId}/debt-clearances/new` — ask for the certificate (JL1, D-306). */
export default async function ClearanceRequestPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = await billedUnitOr404(unitId);
  if (!canRequestClearance(unit)) notFound();
  const [t, form] = await Promise.all([
    getTranslations("resident.fees"),
    getTranslations("resident.fees.clearance.form"),
  ]);
  const today = bangkokToday();
  const latest = new Date(Date.parse(`${today}T00:00:00Z`) + AS_OF_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  return (
    <ResidentShell active="bills" back={{ href: `/units/${unitId}/debt-clearances`, label: t("clearance.title") }}>
      <Screen testId="clearance-new">
        <ScreenHeader title={form("title")} lede={unitName(t, unit)} flush />
        <ClearanceRequest
          unitId={unitId}
          unitName={unitName(t, unit)}
          today={today}
          latest={latest}
          verifyBase={serverEnv().OWNER_CONSOLE_URL}
        />
      </Screen>
    </ResidentShell>
  );
}
