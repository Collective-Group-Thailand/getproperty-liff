import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { loadOpenableGates } from "@/features/resident/visitors/data";
import { gateUnit } from "@/features/resident/visitors/model";
import { OpenBarrierScreen } from "@/features/resident/visitors/OpenBarrierScreen";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.open");
  return { title: t("title") };
}

/** `/visitors/open` — the home quick action "เปิดไม้กั้น" as its own screen (JL4, D-316, D-328). */
export default async function OpenBarrierPage() {
  const actor = await getActor();
  if (actor.status !== "signed-in" || !actor.unit || !gateUnit(actor.unit)) notFound();
  const [t, locale, gates] = await Promise.all([
    getTranslations("resident.visitors"),
    pageLocale(),
    loadOpenableGates(actor.unit.propertyId),
  ]);
  return (
    <ResidentShell active="visitors" back={{ href: "/visitors", label: t("title") }}>
      {gates.error ? <ProblemPage error={gates.error} /> : <OpenBarrierScreen gates={gates.data} locale={locale} />}
    </ResidentShell>
  );
}
