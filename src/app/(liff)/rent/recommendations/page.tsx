import { getTranslations } from "next-intl/server";

import { ProblemPage } from "@/features/shared/ProblemNotice";
import { RecommendationsPage } from "@/features/shared/recommendations/pages";
import { requireProspect } from "@/lib/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("recommendations");
  return { title: t("title") };
}

/** Recommended places for someone looking for a place (GL1, D-300): consent, preferences, one-tap stop, history. */
export default async function ProspectRecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireProspect({ path: "/rent/recommendations" });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  return <RecommendationsPage audience="prospect" searchParams={await searchParams} />;
}
