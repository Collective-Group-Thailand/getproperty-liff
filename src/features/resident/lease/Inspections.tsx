import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { INSPECTION_STATUS, type ResidentInspectionStatus } from "@/domain/status/inspection";
import { PhotoGallery } from "@/features/shared/PhotoGallery";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconChecklist } from "@/ui/icons/glyphs/checklist";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

type Inspection = Schemas["ResidentInspectionDto"];

/** The move-in / move-out reports of a lease, each with whether it waits for my signature (L5 5.2, D-253). */
export async function InspectionList({
  leaseId,
  inspections,
  locale,
}: {
  leaseId: string;
  inspections: Inspection[];
  locale: Locale;
}) {
  if (!inspections.length) return null;
  const [t, root] = await Promise.all([getTranslations("resident.lease.inspections"), getTranslations()]);
  return (
    <Card as="section" padding="none" aria-labelledby="lease-inspections" data-testid="lease-inspections">
      <h2 id="lease-inspections" className="px-4 pt-4 font-semibold">
        {t("title")}
      </h2>
      <ul className="divide-border flex flex-col divide-y" role="list">
        {inspections.map((inspection) => {
          const status = INSPECTION_STATUS[inspection.status as ResidentInspectionStatus] ?? INSPECTION_STATUS.signed;
          return (
            <li key={inspection.id}>
              <Link
                href={`/lease/${leaseId}/inspections/${inspection.id}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3"
                data-testid="lease-inspection"
                data-status={inspection.status}
              >
                <Icon icon={IconChecklist} className="text-primary shrink-0" />
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">
                    {t(`type.${inspection.type === "move_out" ? "move_out" : "move_in"}`)}
                  </span>
                  <span className="text-muted text-sm">
                    {[
                      inspection.reportNumber,
                      inspection.completedAt ? formatDate(inspection.completedAt, locale) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
                <Icon icon={IconChevronRight} className="text-muted shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const CONDITIONS = ["good", "fair", "damaged", "missing", "not_applicable"] as const;

/** Every line of the report: what was checked, its condition, notes and photos (evidence for the deposit, D-023). */
export async function InspectionLines({ inspection }: { inspection: Inspection }) {
  const t = await getTranslations("resident.lease.inspections");
  const areas = [...new Set(inspection.items.map((item) => item.area ?? ""))];
  return (
    <div className="flex flex-col gap-4" data-testid="inspection-lines">
      {areas.map((area) => (
        <Card as="section" padding="md" key={area || "-"} className="flex flex-col gap-3">
          {area ? <h2 className="font-semibold">{area}</h2> : null}
          <ul className="divide-border flex flex-col divide-y" role="list">
            {inspection.items
              .filter((item) => (item.area ?? "") === area)
              .map((item) => {
                const condition = CONDITIONS.find((c) => c === item.condition) ?? null;
                return (
                  <li key={item.id} className="flex flex-col gap-2 py-3" data-testid="inspection-line">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{item.label}</span>
                      {condition ? (
                        <span className="text-muted shrink-0 text-sm" data-condition={condition}>
                          {t(`condition.${condition}`)}
                        </span>
                      ) : null}
                    </div>
                    {item.meterRegister ? <span className="text-sm tabular-nums">{item.meterRegister}</span> : null}
                    {item.notes ? <p className="text-muted text-sm">{item.notes}</p> : null}
                    {item.photoUrls.length ? (
                      <PhotoGallery
                        label={t("photos", { item: item.label })}
                        photos={item.photoUrls.map((url, index) => ({
                          id: `${item.id}-${index}`,
                          url,
                          alt: t("photoAlt", { item: item.label, n: index + 1 }),
                        }))}
                      />
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
