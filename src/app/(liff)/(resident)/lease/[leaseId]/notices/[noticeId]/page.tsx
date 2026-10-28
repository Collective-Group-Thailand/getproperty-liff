import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadRenewalOffers } from "@/features/resident/contracts/data";
import { loadLease, loadNotices, pageLocale } from "@/features/resident/lease/data";
import { LetterView } from "@/features/resident/lease/Letters";
import { NoticeDocumentButton } from "@/features/resident/lease/NoticeDocumentButton";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.lease.letters");
  return { title: t("title") };
}

/** A letter from the landlord (B7.5, D-253) — where the LINE message about it lands. */
export default async function LetterPage({ params }: { params: Promise<{ leaseId: string; noticeId: string }> }) {
  const { leaseId, noticeId } = await params;
  const [t, locale, lease, notices] = await Promise.all([
    getTranslations("resident.lease"),
    pageLocale(),
    loadLease(leaseId),
    loadNotices(leaseId),
  ]);
  const error = lease.error ?? notices.error;
  const notice = notices.data?.find((candidate) => candidate.id === noticeId);
  // GL3 (D-294): a renewal-offer letter leads to the offer, answered in the app. Optional — a failure hides the button.
  const offer =
    notice?.kind === "renewal_offer"
      ? (await loadRenewalOffers()).data?.find((candidate) => candidate.noticeId === notice.id)
      : undefined;
  if (!error && !notice) notFound();
  return (
    <ResidentShell active={null}>
      <BackLink href={`/lease/${leaseId}`}>{t("letters.back")}</BackLink>
      {error || !notice || !lease.data ? (
        <ProblemPage error={error!} />
      ) : (
        <LetterView
          leaseId={leaseId}
          notice={notice}
          tenantName={lease.data.tenantName}
          locale={locale}
          documentButton={<NoticeDocumentButton leaseId={leaseId} noticeId={notice.id} />}
          renewalOfferId={offer?.id}
        />
      )}
    </ResidentShell>
  );
}
