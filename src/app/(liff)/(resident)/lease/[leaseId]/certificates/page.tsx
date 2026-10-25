import { getTranslations } from "next-intl/server";

import { CertificateRequestForm } from "@/features/resident/lease/CertificateRequestForm";
import { CERTIFICATE_LEASE_STATES, CertificateList } from "@/features/resident/lease/Certificates";
import { loadCertificates, loadLease, pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("resident.lease.certificates");
  return { title: t("title") };
}

/**
 * Rent payment certificates of a lease (B7.5, D-253) — where the LINE message about an answer lands. I ask for one
 * (for a visa, a bank, an employer); the landlord issues it or says why not.
 */
export default async function CertificatesPage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const [t, locale, lease, certificates] = await Promise.all([
    getTranslations("resident.lease.certificates"),
    pageLocale(),
    loadLease(leaseId),
    loadCertificates(leaseId),
  ]);
  const error = lease.error ?? certificates.error;
  if (error || !lease.data || !certificates.data) {
    return (
      <ResidentShell active={null}>
        <ProblemPage error={error!} />
      </ResidentShell>
    );
  }
  const open = certificates.data.some((certificate) => certificate.state === "requested");
  const canAsk = CERTIFICATE_LEASE_STATES.includes(lease.data.status);
  return (
    <ResidentShell active={null}>
      <BackLink href={`/lease/${leaseId}`}>{t("back")}</BackLink>
      <div className="flex flex-col gap-4 py-5" data-testid="certificates-page">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("lead", { name: lease.data.tenantName })}</p>
        </div>
        {!canAsk ? (
          <Callout tone="info" title={t("unavailableTitle")}>
            {t("unavailableBody")}
          </Callout>
        ) : open ? (
          <div data-testid="certificate-open">
            <Callout tone="info" title={t("openTitle")}>
              {t("openBody")}
            </Callout>
          </div>
        ) : (
          <CertificateRequestForm leaseId={leaseId} defaultLanguage={locale === "th" ? "th" : "en"} />
        )}
        <CertificateList leaseId={leaseId} certificates={certificates.data} locale={locale} />
      </div>
    </ResidentShell>
  );
}
