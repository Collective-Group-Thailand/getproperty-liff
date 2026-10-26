import { getLocale, getTranslations } from "next-intl/server";

import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { RentRecordFacts } from "@/features/shared/rentRecord/RentRecordFacts";
import { RentRecordShares } from "@/features/shared/rentRecord/RentRecordShares";
import { isLocale } from "@/i18n/routing";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireProspect } from "@/lib/auth/guards";
import { Card } from "@/ui/components/Card";

export async function generateMetadata() {
  const t = await getTranslations("rentRecord");
  return { title: t("title") };
}

/** My rent record while I look for a place (D-256): the same facts, letters and shares as in the resident app. */
export default async function ProspectRentRecordPage() {
  const actor = await requireProspect({ path: "/rent/rent-record" });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  const [t, mine, current] = await Promise.all([
    getTranslations("rentRecord"),
    getTranslations("prospect.rent.mine"),
    getLocale(),
  ]);
  const locale = isLocale(current) ? current : "th";
  const api = await serverApi("prospect");
  const { data, error, response } = await api.GET("/v1/prospect/me/rent-record");
  return (
    <div className="flex flex-col gap-4 py-3" data-testid="rent-record-page">
      <BackLink href="/rent/enquiries">{mine("title")}</BackLink>
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
            audience="prospect"
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
  );
}
