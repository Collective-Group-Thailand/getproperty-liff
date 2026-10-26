import { getLocale, getTranslations } from "next-intl/server";

import { BackLink } from "@/features/shared/BackLink";
import { IdentityVerificationPanel } from "@/features/shared/IdentityVerificationPanel";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { isLocale } from "@/i18n/routing";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireProspect } from "@/lib/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("verification");
  return { title: t("title") };
}

/** Verify my identity before I enquire (D-267, O-021): owners see the badge on my enquiries. */
export default async function ProspectVerificationPage() {
  const actor = await requireProspect({ path: "/rent/verification" });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  const [t, current] = await Promise.all([getTranslations("prospect.rent.mine"), getLocale()]);
  const api = await serverApi("prospect");
  const { data, error, response } = await api.GET("/v1/prospect/me/identity-verification");
  return (
    <div className="flex flex-col gap-2 py-3">
      <BackLink href="/rent/enquiries">{t("title")}</BackLink>
      {data ? (
        <IdentityVerificationPanel audience="prospect" status={data} locale={isLocale(current) ? current : "th"} />
      ) : (
        <ProblemPage error={problemFromParsed(response, error)} />
      )}
    </div>
  );
}
