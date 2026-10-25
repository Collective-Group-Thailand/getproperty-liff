import { getTranslations } from "next-intl/server";

import { EnquiryList } from "@/features/prospect/EnquiryList";
import { ProblemPage } from "@/features/shared/ProblemNotice";
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
  const { data, error, response } = await api.GET("/v1/prospect/enquiries");
  if (!data) return <ProblemPage error={problemFromParsed(response, error)} />;
  return <EnquiryList enquiries={data} />;
}
