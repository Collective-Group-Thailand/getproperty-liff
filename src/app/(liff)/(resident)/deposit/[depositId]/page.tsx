import { getTranslations } from "next-intl/server";

import { DepositView } from "@/features/resident/deposit/DepositView";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";

export async function generateMetadata() {
  const t = await getTranslations("resident.deposit");
  return { title: t("listTitle") };
}

/** The deposit and its settlement (D-023): deductions with photos, the proposed refund, accept or dispute. */
export default async function DepositPage({ params }: { params: Promise<{ depositId: string }> }) {
  const { depositId } = await params;
  const [t, locale, api] = await Promise.all([getTranslations("resident.lease"), pageLocale(), serverApi()]);
  const { data, error, response } = await api.GET("/v1/resident/deposits/{depositId}", {
    params: { path: { depositId } },
  });
  return (
    <ResidentShell active={null}>
      {data ? <BackLink href={`/lease/${data.leaseId}`}>{t("back.lease")}</BackLink> : null}
      {data ? (
        <DepositView deposit={data} locale={locale} />
      ) : (
        <ProblemPage error={problemFromParsed(response, error)} />
      )}
    </ResidentShell>
  );
}
