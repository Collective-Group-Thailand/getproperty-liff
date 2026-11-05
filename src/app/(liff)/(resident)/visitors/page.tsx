import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { bangkokToday } from "@/features/resident/invoices/model";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import {
  loadCars,
  loadGate,
  loadIncidents,
  loadInvites,
  loadOpenableGates,
  loadRemembered,
  loadVisits,
} from "@/features/resident/visitors/data";
import { gateUnit } from "@/features/resident/visitors/model";
import { VisitorsScreen } from "@/features/resident/visitors/VisitorsScreen";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors");
  return { title: t("title") };
}

/**
 * `/visitors` — the gate for the unit on screen (JL4, D-315 … D-317, D-327, D-328). The visits are the page; the
 * barrier, invites, cars and SOS are extras that leave their part out when they cannot be read.
 */
export default async function VisitorsPage() {
  const actor = await getActor();
  if (actor.status !== "signed-in") notFound();
  const unit = actor.unit;
  if (!unit || !gateUnit(unit)) notFound();
  const [locale, gate, visits, invites, openable, incidents, cars, remembered] = await Promise.all([
    pageLocale(),
    loadGate(unit.unitId),
    loadVisits(unit.unitId, { perPage: 50 }),
    loadInvites(unit.unitId).catch(() => ({ data: [] })),
    loadOpenableGates(unit.propertyId).catch(() => ({ data: [] })),
    loadIncidents(unit.unitId).catch(() => ({ data: [] })),
    loadCars(unit.unitId).catch(() => ({ data: [] })),
    loadRemembered(unit.unitId).catch(() => ({ data: [] })),
  ]);
  const error = gate.error ?? visits.error;
  return (
    <ResidentShell active="visitors">
      {error ? (
        <ProblemPage error={error} />
      ) : (
        <VisitorsScreen
          unit={unit}
          gate={gate.data ?? null}
          visits={visits.data?.items ?? []}
          invites={invites.data ?? []}
          openable={openable.data ?? []}
          incidents={incidents.data ?? []}
          counts={{ cars: cars.data?.length ?? 0, remembered: remembered.data?.length ?? 0 }}
          today={bangkokToday()}
          locale={locale}
        />
      )}
    </ResidentShell>
  );
}
