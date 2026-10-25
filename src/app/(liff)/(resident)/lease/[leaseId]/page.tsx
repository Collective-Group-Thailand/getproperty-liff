import { getTranslations } from "next-intl/server";

import { loadLease, loadNotices, pageLocale } from "@/features/resident/lease/data";
import { LetterList } from "@/features/resident/lease/Letters";
import { LeaseView } from "@/features/resident/lease/LeaseView";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { serverApi } from "@/lib/api/server";

export async function generateMetadata() {
  const t = await getTranslations("resident.lease");
  return { title: t("list.title") };
}

/** One lease (B2.3): terms, parties, the document, building rules, notice and the deposit link. */
export default async function LeasePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const [t, locale, lease, deposits, notices] = await Promise.all([
    getTranslations("resident.lease"),
    pageLocale(),
    loadLease(leaseId),
    serverApi().then((api) => api.GET("/v1/resident/deposits")),
    loadNotices(leaseId),
  ]);
  const depositId = deposits.data?.find((d) => d.leaseId === leaseId)?.id;
  return (
    <ResidentShell active={null}>
      <BackLink href="/">{t("back.home")}</BackLink>
      {lease.error ? (
        <ProblemPage error={lease.error} />
      ) : (
        <>
          <LeaseView lease={lease.data} locale={locale} depositId={depositId} />
          {notices.data ? <LetterList leaseId={leaseId} notices={notices.data} locale={locale} /> : null}
        </>
      )}
    </ResidentShell>
  );
}
