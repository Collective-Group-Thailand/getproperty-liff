import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { loadGate, loadVisit, requestTime } from "@/features/resident/visitors/data";
import { VisitScreen } from "@/features/resident/visitors/VisitScreen";
import { parseAnswer, rememberDays } from "@/features/resident/visitors/model";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.visit");
  return { title: t("metaTitle") };
}

/**
 * `/visits/{visitId}` — a visitor at the gate, opened from the household's LINE message (its buttons add
 * `?answer=approve|deny|call_me`, which only opens a confirmation) or from `/visitors` (JL4, D-315, D-327).
 */
export default async function VisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ visitId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ visitId }, query] = await Promise.all([params, searchParams]);
  const [actor, locale, loaded] = await Promise.all([getActor(), pageLocale(), loadVisit(visitId)]);
  if (actor.status !== "signed-in") return null;
  // CR #50: the estate's remember days come with the unit's gate (a failed read only drops the number from the copy).
  const gate = loaded.data?.unitId ? await loadGate(loaded.data.unitId) : null;
  return (
    <ResidentShell active="visitors">
      {loaded.error ? (
        <ProblemPage error={loaded.error} />
      ) : (
        <VisitScreen
          visit={loaded.data}
          me={actor.me.user.displayName}
          answer={parseAnswer(query.answer)}
          locale={locale}
          now={requestTime()}
          rememberDays={rememberDays(gate?.data)}
          unit={actor.units.find((u) => u.unitId === loaded.data?.unitId) ?? actor.unit}
        />
      )}
    </ResidentShell>
  );
}
