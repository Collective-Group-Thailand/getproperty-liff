import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { RENT_CERTIFICATE_STATE } from "@/domain/status/rentCertificate";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconReceipt } from "@/ui/icons/glyphs/receipt";

import { CertificateDocumentButton } from "./CertificateDocumentButton";

type Certificate = Schemas["RentCertificateDto"];

/** Lease statuses where a certificate can be asked for — the API answers `lease.invalid_state` otherwise. */
export const CERTIFICATE_LEASE_STATES: readonly string[] = ["active", "notice_given", "ending", "ended"];

/** The way from a lease to its rent certificates (B7.5, D-253). */
export async function CertificateLink({ leaseId }: { leaseId: string }) {
  const t = await getTranslations("resident.lease.certificates");
  return (
    <Card padding="none">
      <Link
        href={`/lease/${leaseId}/certificates`}
        className="flex min-h-14 items-center gap-3 px-4 py-3"
        data-testid="lease-certificates"
      >
        <Icon icon={IconReceipt} className="text-primary shrink-0" />
        <span className="flex flex-1 flex-col">
          <span className="font-medium">{t("title")}</span>
          <span className="text-muted text-sm">{t("linkHint")}</span>
        </span>
        <Icon icon={IconChevronRight} className="text-muted shrink-0" />
      </Link>
    </Card>
  );
}

/** My requests and certificates, newest first: what each is for, the period, and the PDF or the landlord's reason. */
export async function CertificateList({
  leaseId,
  certificates,
  locale,
}: {
  leaseId: string;
  certificates: Certificate[];
  locale: Locale;
}) {
  const [t, root] = await Promise.all([getTranslations("resident.lease.certificates"), getTranslations()]);
  if (!certificates.length) {
    return (
      <p className="text-muted text-sm" data-testid="certificates-empty">
        {t("empty")}
      </p>
    );
  }
  return (
    <section aria-labelledby="certificates-list-title" className="flex flex-col gap-3">
      <h2 id="certificates-list-title" className="font-semibold">
        {t("listTitle")}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {certificates.map((certificate) => {
          const status = RENT_CERTIFICATE_STATE[certificate.state];
          return (
            <li key={certificate.id}>
              <Card data-testid="certificate" data-state={certificate.state}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{t(`purposes.${certificate.purpose}`)}</span>
                    <span className="text-muted text-sm">
                      {t("period", {
                        from: formatDate(certificate.periodFrom, locale),
                        to: formatDate(certificate.periodTo, locale),
                      })}
                    </span>
                  </div>
                  <StatusBadge status={status} label={root(status.labelKey)} />
                </div>
                {certificate.state === "issued" ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <p className="text-muted text-sm">
                      {t("issued", {
                        number: certificate.number ?? "—",
                        date: certificate.decidedAt ? formatDate(certificate.decidedAt, locale) : "—",
                      })}
                      {certificate.totalPaid
                        ? ` · ${t("totalPaid", { amount: formatTHB(certificate.totalPaid, locale) })}`
                        : null}
                    </p>
                    <CertificateDocumentButton leaseId={leaseId} certificateId={certificate.id} />
                  </div>
                ) : null}
                {certificate.state === "requested" ? (
                  <p className="text-muted mt-3 text-sm">
                    {t("waiting", { date: formatDate(certificate.requestedAt, locale) })}
                  </p>
                ) : null}
                {certificate.state === "declined" ? (
                  <p className="border-border mt-3 border-t pt-3 text-sm" data-testid="certificate-decline">
                    {t("declined", { reason: certificate.declineReason ?? "—" })}
                  </p>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
