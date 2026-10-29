import { getTranslations } from "next-intl/server";

import { ProblemPage } from "@/features/shared/ProblemNotice";
import { historyPath } from "@/features/shared/recommendations/model";
import { RecommendationsHistoryPage } from "@/features/shared/recommendations/pages";
import { requireProspect } from "@/lib/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("recommendations.history");
  return { title: t("title") };
}

/** What was sent to me (D-300), paged. */
export default async function ProspectRecommendationsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = await requireProspect({ path: historyPath("prospect", params.page) });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  return <RecommendationsHistoryPage audience="prospect" searchParams={params} />;
}
