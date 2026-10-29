import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { RecommendationsPage } from "@/features/shared/recommendations/pages";
import { getActor } from "@/lib/auth/actor";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("recommendations");
  return { title: t("title") };
}

/**
 * Recommended places (GL1, D-300) — the link of every sponsored LINE message (`${PUBLIC_RESIDENT_APP_URL}/recommendations`,
 * "why did I get this / stop"). Signed in as a resident: the settings here, in the resident frame. Anyone else goes to
 * the prospect screen (`/rent/recommendations`): the consent belongs to the LINE login, not to a landlord, and a
 * prospect sign-in works for every LINE user — a resident session is never required to stop the messages.
 */
export default async function ResidentRecommendationsPage({
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
  if (actor.status !== "signed-in") {
    const keep = params.stopped === "1" ? "?stopped=1" : params.saved === "1" ? "?saved=1" : "";
    redirect(`/rent/recommendations${keep}`);
  }
  return (
    <ResidentShell active="me">
      <RecommendationsPage audience="resident" searchParams={params} />
    </ResidentShell>
  );
}
