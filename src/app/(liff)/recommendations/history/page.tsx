import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { historyPath } from "@/features/shared/recommendations/model";
import { RecommendationsHistoryPage } from "@/features/shared/recommendations/pages";
import { getActor } from "@/lib/auth/actor";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("recommendations.history");
  return { title: t("title") };
}

/** What was sent to me (D-300), for a signed-in resident; anyone else reads it on the prospect side. */
export default async function ResidentRecommendationsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, params] = await Promise.all([getActor(), searchParams]);
  if (actor.status === "error") {
    return (
      <ResidentShell active={null} chrome="minimal">
        <ProblemPage error={actor.error} />
      </ResidentShell>
    );
  }
  if (actor.status !== "signed-in") redirect(historyPath("prospect", params.page));
  return (
    <ResidentShell active="me">
      <RecommendationsHistoryPage audience="resident" searchParams={params} />
    </ResidentShell>
  );
}
