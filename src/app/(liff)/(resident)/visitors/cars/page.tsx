import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { CarsManager } from "@/features/resident/visitors/CarsManager";
import { loadCars, loadGate, loadRemembered } from "@/features/resident/visitors/data";
import { canEditGate, gateUnit } from "@/features/resident/visitors/model";
import { Screen, ScreenHeader } from "@/features/shared/Screen";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.cars");
  return { title: t("title") };
}

/** `/visitors/cars` — the household's registered cars and the visitor cars it remembers (JL4, D-327, D-328). */
export default async function CarsPage() {
  const actor = await getActor();
  if (actor.status !== "signed-in" || !actor.unit || !gateUnit(actor.unit)) notFound();
  const unit = actor.unit;
  const [t, locale, cars, remembered, gate] = await Promise.all([
    getTranslations("resident.visitors"),
    pageLocale(),
    loadCars(unit.unitId),
    loadRemembered(unit.unitId),
    loadGate(unit.unitId),
  ]);
  const error = cars.error ?? remembered.error ?? gate.error;
  return (
    <ResidentShell active="visitors" back={{ href: "/visitors", label: t("title") }}>
      {error ? (
        <ProblemPage error={error} />
      ) : (
        <Screen testId="cars-screen">
          <ScreenHeader flush title={t("cars.title")} lede={t("cars.lede")} />
          <CarsManager
            unitId={unit.unitId}
            cars={cars.data ?? []}
            remembered={remembered.data ?? []}
            canEdit={canEditGate(unit, gate.data?.canEdit)}
            locale={locale}
          />
        </Screen>
      )}
    </ResidentShell>
  );
}
