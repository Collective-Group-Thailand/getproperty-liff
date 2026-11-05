import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { loadGate } from "@/features/resident/visitors/data";
import { canEditGate, gateUnit } from "@/features/resident/visitors/model";
import { PolicyForm } from "@/features/resident/visitors/PolicyForm";
import { Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.policy");
  return { title: t("title") };
}

/**
 * `/visitors/policy` — the house's agreement with the gate (JL4, D-315, D-327) and the gate's privacy notice as the
 * API returns it (Thai for Thai readers, English otherwise — never translated here, J-DESIGN §1.5).
 */
export default async function PolicyPage() {
  const actor = await getActor();
  if (actor.status !== "signed-in" || !actor.unit || !gateUnit(actor.unit)) notFound();
  const unit = actor.unit;
  const [t, locale, gate] = await Promise.all([
    getTranslations("resident.visitors"),
    getLocale(),
    loadGate(unit.unitId),
  ]);
  if (gate.data === null) notFound();
  return (
    <ResidentShell active="visitors" back={{ href: "/visitors", label: t("title") }}>
      {gate.error ? (
        <ProblemPage error={gate.error} />
      ) : (
        <Screen testId="policy-screen">
          <ScreenHeader flush title={t("policy.title")} lede={t("policy.lede")} />
          <PolicyForm unitId={unit.unitId} policy={gate.data.policy} canEdit={canEditGate(unit, gate.data.canEdit)} />
          <Section title={t("policy.privacy")} titleId="privacy" id="privacy" testId="policy-privacy">
            <div className="rounded-card border-border bg-surface flex flex-col gap-2 border p-4 text-sm">
              <p className="whitespace-pre-line">
                {locale === "th" ? gate.data.privacyNotice.th : gate.data.privacyNotice.en}
              </p>
              <p className="text-muted">{t("privacy", { days: gate.data.privacyNotice.retentionDays })}</p>
            </div>
          </Section>
        </Screen>
      )}
    </ResidentShell>
  );
}
