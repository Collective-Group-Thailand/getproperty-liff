import { getTranslations } from "next-intl/server";

import { WORK_ORDER_STATUS } from "@/domain/status/workOrder";
import { PhotoGallery } from "@/features/shared/PhotoGallery";
import { LazyRequestThread } from "@/features/shared/LazyRequestThread";
import { formatClock } from "@/features/shared/time";
import { formatDate, formatDateTime, formatDecimal, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { DescriptionList } from "@/ui/components/DescriptionList";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { SimpleTable } from "@/ui/components/SimpleTable";

import { CostLineForm } from "./CostLineForm";
import { DoorCodes } from "./DoorCodes";
import { canAddPhotos, fieldActions, type WorkOrder } from "./model";
import { WorkOrderActions } from "./WorkOrderActions";
import { WorkOrderPhotos } from "./WorkOrderPhotos";

/**
 * One work order for its technician (L4 4.4 §2, A4.3): the place (unit, building), the visit window, the problem
 * with the resident's photos, the door codes of the visit, the next field step, before / after photos, parts and
 * costs (amounts and the total are the API's), the thread with the resident through the platform (never a phone
 * number), and — once done — the resident's rating. Photo links (5 minutes; a file not scanned clean yet is a
 * placeholder), the resident's preferred visit and the rating are the API's (D-218).
 */
export async function WorkOrderDetail({ workOrder, locale }: { workOrder: WorkOrder; locale: Locale }) {
  const [t, root] = await Promise.all([getTranslations("technician.workOrders"), getTranslations()]);
  const status = WORK_ORDER_STATUS[workOrder.status];
  const photos = workOrder.photos;
  const requestPhotos = photos.filter((p) => p.role === "report");
  const open = canAddPhotos(workOrder);
  const finished = workOrder.status === "done" || workOrder.status === "verified";
  const uploaded = (role: "before" | "after", label: string) => {
    const list = photos.filter((p) => p.role === role);
    return list.length ? (
      <PhotoGallery
        label={label}
        testId={`wo-gallery-${role}`}
        photos={list.map((p, i) => ({
          id: p.id,
          url: p.url,
          alt: t("photos.uploadedAlt", { role: label, index: i + 1 }),
        }))}
      />
    ) : null;
  };

  return (
    <div className="flex flex-col gap-4 py-5" data-testid="work-order" data-status={workOrder.status}>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">{workOrder.title}</h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={status} label={root(status.labelKey)} />
          <Badge tone={workOrder.priority === "urgent" || workOrder.priority === "high" ? "warning" : "neutral"}>
            {t(`priority.${workOrder.priority}`)}
          </Badge>
        </div>
      </div>

      <Card as="section" padding="md" aria-label={t("detail.place")}>
        <DescriptionList
          columns={1}
          items={[
            {
              id: "place",
              term: t("detail.place"),
              description: workOrder.unitNo
                ? t("where", { unit: workOrder.unitNo, building: workOrder.buildingName })
                : workOrder.buildingName,
            },
            {
              id: "visit",
              term: t("detail.visit"),
              description: workOrder.scheduledAt
                ? workOrder.scheduledUntil
                  ? t("when", {
                      date: formatDate(workOrder.scheduledAt, locale),
                      from: formatClock(workOrder.scheduledAt),
                      to: formatClock(workOrder.scheduledUntil),
                    })
                  : formatDateTime(workOrder.scheduledAt, locale)
                : t("detail.noVisit"),
            },
            ...(workOrder.preferredVisit
              ? [
                  {
                    id: "preferredVisit",
                    term: t("detail.preferredVisit"),
                    description: t(`detail.visitPreference.${workOrder.preferredVisit}`),
                  },
                ]
              : []),
            { id: "kind", term: t("detail.problem"), description: t(`detail.kind.${workOrder.kind}`) },
            {
              id: "problem",
              term: t("detail.problem"),
              description: (
                <span className="whitespace-pre-line">{workOrder.requestDescription ?? workOrder.description}</span>
              ),
            },
          ]}
        />
      </Card>

      <Card as="section" padding="md" aria-labelledby="wo-request-photos">
        <h2 id="wo-request-photos" className="mb-2 font-semibold">
          {t("detail.requestPhotos")}
        </h2>
        {requestPhotos.length ? (
          <PhotoGallery
            label={t("detail.requestPhotos")}
            testId="wo-gallery-report"
            photos={requestPhotos.map((p, i) => ({
              id: p.id,
              url: p.url,
              alt: t("detail.requestPhotoAlt", { index: i + 1 }),
            }))}
          />
        ) : (
          <p className="text-muted text-sm">
            {t("detail.noRequestPhotos", { count: workOrder.requestPhotoIds.length })}
          </p>
        )}
      </Card>

      {open ? (
        <Card as="section" padding="md" aria-labelledby="wo-door" className="flex flex-col gap-2">
          <h2 id="wo-door" className="font-semibold">
            {t("detail.doorCodes")}
          </h2>
          <DoorCodes workOrderId={workOrder.id} />
        </Card>
      ) : null}

      <WorkOrderActions
        workOrderId={workOrder.id}
        actions={fieldActions(workOrder)}
        hasAfterPhoto={workOrder.afterPhotoIds.length > 0}
      />

      {(["before", "after"] as const).map((role) => (
        <Card key={role} as="section" padding="md" aria-labelledby={`wo-${role}`} className="flex flex-col gap-3">
          <h2 id={`wo-${role}`} className="font-semibold">
            {t(`photos.${role}`)}
          </h2>
          {uploaded(role, t(`photos.${role}`))}
          {open ? <WorkOrderPhotos workOrderId={workOrder.id} role={role} /> : null}
        </Card>
      ))}

      <Card as="section" padding="md" aria-labelledby="wo-costs" className="flex flex-col gap-3" data-testid="wo-costs">
        <div>
          <h2 id="wo-costs" className="font-semibold">
            {t("costs.title")}
          </h2>
          <p className="text-muted text-sm">{t("costs.lead")}</p>
        </div>
        {workOrder.costLines.length ? (
          <>
            <SimpleTable
              caption={t("costs.caption")}
              minWidth="18rem"
              testId="cost-lines"
              columns={[
                { key: "what", header: t("costs.description") },
                { key: "amount", header: t("costs.amount"), align: "end" },
              ]}
              rows={workOrder.costLines.map((line) => ({
                key: line.id,
                cells: {
                  what: (
                    <span className="flex flex-col">
                      <span>{line.description}</span>
                      <span className="text-muted text-xs">
                        {t(`costs.kind.${line.kind}`)} ·{" "}
                        {t("costs.line", {
                          quantity: formatDecimal(line.quantity, locale, 3),
                          price: formatTHB(line.unitPrice, locale),
                        })}
                      </span>
                    </span>
                  ),
                  amount: formatTHB(line.amount, locale),
                },
              }))}
            />
            <div className="flex items-baseline justify-between gap-3" data-testid="cost-total">
              <span className="font-medium">{t("costs.total")}</span>
              <MoneyDisplay amount={workOrder.costTotal} locale={locale} />
            </div>
          </>
        ) : (
          <p className="text-muted text-sm">{t("costs.empty")}</p>
        )}
        {open ? <CostLineForm workOrderId={workOrder.id} /> : null}
      </Card>

      {finished ? (
        <Card as="section" padding="md" aria-labelledby="wo-rating" data-testid="wo-rating">
          <h2 id="wo-rating" className="font-semibold">
            {t("detail.rating")}
          </h2>
          {workOrder.completedAt ? (
            <p className="text-muted text-sm">
              {t("detail.completedAt", { date: formatDateTime(workOrder.completedAt, locale) })}
            </p>
          ) : null}
          {workOrder.completionNote ? (
            <p className="mt-1 text-sm">{t("detail.note", { note: workOrder.completionNote })}</p>
          ) : null}
          {workOrder.rating ? (
            <p className="mt-2 font-medium">
              <span aria-hidden="true" className="text-primary me-2">
                {"★".repeat(workOrder.rating)}
              </span>
              {t("detail.ratingValue", { rating: workOrder.rating })}
              {workOrder.ratingComment ? (
                <span className="text-muted block font-normal">
                  {t("detail.ratingComment", { comment: workOrder.ratingComment })}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-muted mt-2 text-sm">{t("detail.ratingNone")}</p>
          )}
        </Card>
      ) : null}

      <LazyRequestThread
        of={{ kind: "technician", workOrderId: workOrder.id }}
        canWrite={!finished && workOrder.status !== "cancelled"}
        namespace="technician.workOrders.thread"
        withOffice={!workOrder.serviceRequestId}
      />
    </div>
  );
}
