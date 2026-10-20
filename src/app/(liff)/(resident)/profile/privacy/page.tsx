import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { PrivacyView } from "@/features/resident/profile/PrivacyView";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";

export async function generateMetadata() {
  const t = await getTranslations("resident.profile.privacy");
  return { title: t("title") };
}

/**
 * Privacy and consent (D-025). Behind the resident guard like every screen: withdrawing a required purpose here
 * sends the resident to the consent screen on the next render, which is how the app "asks again" before it can be
 * used; optional purposes are withdrawn and granted in place.
 */
export default async function PrivacyPage() {
  const [t, locale, api] = await Promise.all([getTranslations("resident.profile"), pageLocale(), serverApi()]);
  const { data, error, response } = await api.GET("/v1/resident/me/privacy");
  return (
    <ResidentShell active="me">
      <BackLink href="/profile">{t("title")}</BackLink>
      {data ? (
        <PrivacyView privacy={data} locale={locale} />
      ) : (
        <ProblemPage error={problemFromParsed(response, error)} />
      )}
    </ResidentShell>
  );
}
