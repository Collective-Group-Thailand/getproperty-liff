import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { loadVisit, requestTime } from "@/features/resident/visitors/data";
import { VisitScreen } from "@/features/resident/visitors/VisitScreen";
import { parseAnswer } from "@/features/resident/visitors/model";
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
          unit={actor.units.find((u) => u.unitId === loaded.data?.unitId) ?? actor.unit}
        />
      )}
    </ResidentShell>
  );
}
