import { getTranslations } from "next-intl/server";

import { INSPECTION_STATUS, type ResidentInspectionStatus } from "@/domain/status/inspection";
import { loadInspection, pageLocale } from "@/features/resident/lease/data";
import { InspectionCountersign } from "@/features/resident/lease/InspectionCountersign";
import { InspectionLines } from "@/features/resident/lease/Inspections";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ExternalLinkButton } from "@/features/shared/ExternalLinkButton";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { formatDate } from "@/i18n/format";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("resident.lease.inspections");
  return { title: t("title") };
}

/**
 * One move-in / move-out report (L5 5.2, D-253) — where the LINE message about it lands: every line with photos, the
 * PDF, and my countersignature when the landlord completed it without me.
 */
export default async function InspectionPage({
  params,
}: {
  params: Promise<{ leaseId: string; inspectionId: string }>;
}) {
  const { leaseId, inspectionId } = await params;
  const [t, root, locale, inspection] = await Promise.all([
    getTranslations("resident.lease.inspections"),
    getTranslations(),
    pageLocale(),
    loadInspection(inspectionId),
  ]);
  if (inspection.error) {
    return (
      <ResidentShell active={null}>
        <ProblemPage error={inspection.error} />
      </ResidentShell>
    );
  }
  const report = inspection.data;
  const status = INSPECTION_STATUS[report.status as ResidentInspectionStatus] ?? INSPECTION_STATUS.signed;
  return (
    <ResidentShell active={null}>
      <BackLink href={`/lease/${leaseId}`}>{t("back")}</BackLink>
      <div className="flex flex-col gap-4 py-5" data-testid="inspection-page" data-status={report.status}>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold">
            {t(`type.${report.type === "move_out" ? "move_out" : "move_in"}`)}
          </h1>
          <p className="text-muted">
            {[
              t("unit", { unit: report.unitNo }),
              report.reportNumber,
              report.completedAt ? formatDate(report.completedAt, locale) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <StatusBadge status={status} label={root(status.labelKey)} className="self-start" />
        </div>
        {report.residentSigned ? (
          <Callout tone="success">{t("signedBoth")}</Callout>
        ) : report.canCountersign ? (
          <Callout tone="info" title={t("pleaseCheckTitle")}>
            {t("pleaseCheck")}
          </Callout>
        ) : null}
        {report.reportUrl ? <ExternalLinkButton href={report.reportUrl}>{t("pdf")}</ExternalLinkButton> : null}
        <InspectionLines inspection={report} />
        {report.notes ? (
          <Callout tone="neutral" title={t("notes")}>
            {report.notes}
          </Callout>
        ) : null}
        {report.residentNote || report.residentPhotoUrls.length ? (
          <Callout tone="neutral" title={t("yourNote")}>
            <div className="flex flex-col gap-3" data-testid="inspection-resident-note">
              {report.residentNote ? <p className="m-0">{report.residentNote}</p> : null}
              {report.residentPhotoUrls.length ? (
                <ul className="grid grid-cols-3 gap-2" role="list">
                  {report.residentPhotoUrls.map((url, index) => (
                    <li key={url}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a signed object-storage link */}
                      <img
                        src={url}
                        alt={t("yourPhotoAlt", { n: index + 1 })}
                        width={96}
                        height={96}
                        className="rounded-control border-border aspect-square w-full border object-cover"
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Callout>
        ) : null}
        {report.canCountersign ? <InspectionCountersign inspectionId={report.id} /> : null}
      </div>
    </ResidentShell>
  );
}
