import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { bangkokToday } from "@/features/resident/invoices/model";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { loadGate, loadVisits } from "@/features/resident/visitors/data";
import { gateUnit } from "@/features/resident/visitors/model";
import { VisitHistory } from "@/features/resident/visitors/VisitHistory";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.history");
  return { title: t("title") };
}

const PER_PAGE = 25;

export default async function VisitHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const actor = await getActor();
  if (actor.status !== "signed-in" || !actor.unit || !gateUnit(actor.unit)) notFound();
  const page = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
  const [t, locale, visits, gate] = await Promise.all([
    getTranslations("resident.visitors"),
    pageLocale(),
    loadVisits(actor.unit.unitId, { page, perPage: PER_PAGE }),
    loadGate(actor.unit.unitId).catch(() => ({ data: null })),
  ]);
  return (
    <ResidentShell active="visitors" back={{ href: "/visitors", label: t("title") }}>
      {visits.error ? (
        <ProblemPage error={visits.error} />
      ) : (
        <VisitHistory
          visits={visits.data.items}
          meta={visits.data.meta}
          page={page}
          retentionDays={gate.data?.privacyNotice.retentionDays ?? null}
          today={bangkokToday()}
          locale={locale}
        />
      )}
    </ResidentShell>
  );
}
