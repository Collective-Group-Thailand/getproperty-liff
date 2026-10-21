import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { ConsentForm } from "@/features/resident/consent/ConsentForm";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireResident } from "@/lib/auth/guards";
import { safeInternalPath } from "@/lib/liff/deepLink";

export async function generateMetadata() {
  const t = await getTranslations("resident.consent");
  return { title: t("title") };
}

/**
 * PDPA consent on first use (D-025). Purposes come from the API in the resident's language; once every required
 * purpose is granted the resident goes on to `next`. Changing or withdrawing consents later is the profile (L3).
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null);
  const self = next === "/" ? "/consent" : `/consent?next=${encodeURIComponent(next)}`;
  const actor = await requireResident({ consent: false, path: self });
  if (actor.status === "signed-in" && actor.me.consentComplete) redirect(next);

  const language = await getLocale();
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/consents");
  const failure = actor.status === "error" ? actor.error : !data ? problemFromParsed(response, error) : null;

  return (
    <ResidentShell active={null} chrome="entry">
      {failure || !data ? (
        <ProblemPage error={failure!} />
      ) : (
        <ConsentForm purposes={data} language={language} next={next} />
      )}
    </ResidentShell>
  );
}
