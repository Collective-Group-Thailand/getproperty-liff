import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { RentRecordFacts } from "@/features/shared/rentRecord/RentRecordFacts";
import { RentRecordShares } from "@/features/shared/rentRecord/RentRecordShares";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { Card } from "@/ui/components/Card";

export async function generateMetadata() {
  const t = await getTranslations("rentRecord");
  return { title: t("title") };
}

/** My rent record (D-256): the facts getproperty confirmed, my letters and shares — nothing shared unless I choose. */
export default async function ResidentRentRecordPage() {
  const [t, profile, locale, api] = await Promise.all([
    getTranslations("rentRecord"),
    getTranslations("resident.profile"),
    pageLocale(),
    serverApi(),
  ]);
  const { data, error, response } = await api.GET("/v1/resident/me/rent-record");
  return (
    <ResidentShell active="me">
      <div className="flex flex-col gap-4 py-3" data-testid="rent-record-page">
        <BackLink href="/profile">{profile("title")}</BackLink>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("lead")}</p>
        </div>
        {data ? (
          <>
            <Card as="section" padding="md" aria-label={t("title")}>
              <RentRecordFacts record={data.record} locale={locale} />
            </Card>
            <RentRecordShares
              audience="resident"
              shares={data.shares}
              canShare={data.record.months.length > 0}
              locale={locale}
            />
            <p className="text-muted text-xs">{t("footnote")}</p>
          </>
        ) : (
          <ProblemPage error={problemFromParsed(response, error)} />
        )}
      </div>
    </ResidentShell>
  );
}
