import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadRules } from "@/features/resident/community/data";
import { RulesView } from "@/features/resident/community/Rules";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.community.rules");
  return { title: t("title") };
}

/** The selected unit's building rules with the acknowledgement (L4, D-073, D-212). */
export default async function RulesPage() {
  const [actor, locale] = await Promise.all([getActor(), pageLocale()]);
  if (actor.status !== "signed-in") return null;
  if (!actor.unit) notFound();
  const loaded = await loadRules(actor.unit.unitId);
  return (
    <ResidentShell active={null}>
      {loaded.error ? (
        <ProblemPage error={loaded.error} />
      ) : (
        <RulesView rules={loaded.data} unitId={actor.unit.unitId} locale={locale} />
      )}
    </ResidentShell>
  );
}
