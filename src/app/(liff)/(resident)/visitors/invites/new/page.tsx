import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { kindWords } from "@/features/resident/fees/model";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { loadGate, requestTime } from "@/features/resident/visitors/data";
import { InviteForm } from "@/features/resident/visitors/InviteForm";
import { canEditGate, gateUnit } from "@/features/resident/visitors/model";
import { Screen, ScreenHeader } from "@/features/shared/Screen";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.invite");
  return { title: t("title") };
}

/** `/visitors/invites/new` — a pass for a visitor (JL4, D-327 (5)); the household only (family reads). */
export default async function NewInvitePage() {
  const actor = await getActor();
  if (actor.status !== "signed-in" || !actor.unit || !gateUnit(actor.unit)) notFound();
  const unit = actor.unit;
  const [t, shell, locale, gate] = await Promise.all([
    getTranslations("resident.visitors"),
    getTranslations("shell.unitSwitcher"),
    pageLocale(),
    loadGate(unit.unitId),
  ]);
  if (gate.data === null || (gate.data && !canEditGate(unit, gate.data.canEdit))) notFound();
  return (
    <ResidentShell active="visitors" back={{ href: "/visitors", label: t("title") }}>
      {gate.error ? (
        <ProblemPage error={gate.error} />
      ) : (
        <Screen testId="invite-screen">
          <ScreenHeader flush title={t("invite.title")} lede={t("invite.lede")} />
          <InviteForm
            unitId={unit.unitId}
            unitName={shell("unit", { unit: unit.unitNo, kind: kindWords(unit.propertyKind).unit })}
            place={unit.tenantName}
            now={requestTime()}
            locale={locale}
            maxDays={gate.data?.inviteMaxDays}
          />
        </Screen>
      )}
    </ResidentShell>
  );
}
