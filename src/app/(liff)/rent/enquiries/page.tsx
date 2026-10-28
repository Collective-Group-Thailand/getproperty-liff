import { getTranslations } from "next-intl/server";

import { EnquiryList } from "@/features/prospect/EnquiryList";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { consentState } from "@/features/shared/recommendations/model";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireProspect } from "@/lib/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("prospect.rent.mine");
  return { title: t("title") };
}

/** My enquiries (L5 5.1 §2). */
export default async function EnquiriesPage() {
  const actor = await requireProspect({ path: "/rent/enquiries" });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  const api = await serverApi("prospect");
  const [{ data, error, response }, verification, recommendations] = await Promise.all([
    api.GET("/v1/prospect/enquiries"),
    api.GET("/v1/prospect/me/identity-verification"),
    api.GET("/v1/prospect/me/recommendations"),
  ]);
  if (!data) return <ProblemPage error={problemFromParsed(response, error)} />;
  return (
    <EnquiryList
      enquiries={data}
      identityVerified={verification.data?.verified ?? null}
      recommendations={recommendations.data ? consentState(recommendations.data.consent) : null}
    />
  );
}
