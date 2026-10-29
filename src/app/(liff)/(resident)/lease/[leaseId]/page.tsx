import { getTranslations } from "next-intl/server";

import { loadContracts, loadRenewalOffers } from "@/features/resident/contracts/data";
import { LeaseContracts } from "@/features/resident/contracts/LeaseContracts";
import { loadInspections, loadLease, loadNotices, pageLocale } from "@/features/resident/lease/data";
import { InspectionList } from "@/features/resident/lease/Inspections";
import { CERTIFICATE_LEASE_STATES, CertificateLink } from "@/features/resident/lease/Certificates";
import { LetterList } from "@/features/resident/lease/Letters";
import { LeaseView } from "@/features/resident/lease/LeaseView";
import { RelocationPrompt } from "@/features/resident/relocation/RelocationPrompt";
import { loadReview } from "@/features/resident/reviews/data";
import { LeaseReviewEntry } from "@/features/resident/reviews/LeaseReviewEntry";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { serverApi } from "@/lib/api/server";

export async function generateMetadata() {
  const t = await getTranslations("resident.lease");
  return { title: t("list.title") };
}

/**
 * One lease (B2.3): terms, parties, the document, building rules, notice and the deposit link; the open offer to renew
 * and the documents of the contract library on it (GL3); after a notice the way to relocation help, and *review this
 * building* (GL4).
 */
export default async function LeasePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const locale = await pageLocale();
  const [t, lease, deposits, notices, inspections, contracts, offers, review] = await Promise.all([
    getTranslations("resident.lease"),
    loadLease(leaseId),
    serverApi().then((api) => api.GET("/v1/resident/deposits")),
    loadNotices(leaseId),
    loadInspections(leaseId),
    // GL3: optional on this page — a failure leaves the section out (the documents have their own page).
    loadContracts(),
    loadRenewalOffers(),
    // GL4: optional — a failure leaves the entry out (the review has its own page).
    loadReview(leaseId, locale),
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
          {lease.data.notice ? <RelocationPrompt /> : null}
          <LeaseContracts
            leaseId={leaseId}
            contracts={contracts.data ?? []}
            offers={offers.data ?? []}
            locale={locale}
          />
          {notices.data ? <LetterList leaseId={leaseId} notices={notices.data} locale={locale} /> : null}
          {inspections.data ? (
            <InspectionList leaseId={leaseId} inspections={inspections.data} locale={locale} />
          ) : null}
          {CERTIFICATE_LEASE_STATES.includes(lease.data.status) ? <CertificateLink leaseId={leaseId} /> : null}
          {review.data ? <LeaseReviewEntry leaseId={leaseId} view={review.data} locale={locale} /> : null}
        </>
      )}
    </ResidentShell>
  );
}
