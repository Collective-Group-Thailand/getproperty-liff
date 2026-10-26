import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { IdentityVerificationPanel } from "@/features/shared/IdentityVerificationPanel";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";

export async function generateMetadata() {
  const t = await getTranslations("verification");
  return { title: t("title") };
}

/** Verify my identity (D-267, O-021) — optional for residents; the e-KYC provider sends me back here. */
export default async function ResidentVerificationPage() {
  const [t, locale, api] = await Promise.all([getTranslations("resident.profile"), pageLocale(), serverApi()]);
  const { data, error, response } = await api.GET("/v1/resident/me/identity-verification");
  return (
    <ResidentShell active="me">
      <div className="flex flex-col gap-2 py-3">
        <BackLink href="/profile">{t("title")}</BackLink>
        {data ? (
          <IdentityVerificationPanel audience="resident" status={data} locale={locale} />
        ) : (
          <ProblemPage error={problemFromParsed(response, error)} />
        )}
      </div>
    </ResidentShell>
  );
}
