import { getTranslations } from "next-intl/server";

import { WORK_ORDER_STATUS } from "@/domain/status/workOrder";
import { PhotoGallery } from "@/features/shared/PhotoGallery";
import { LazyRequestThread } from "@/features/shared/LazyRequestThread";
import { formatClock } from "@/features/shared/time";
import { formatDate, formatDateTime, formatDecimal, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { SimpleTable } from "@/ui/components/SimpleTable";
import { Icon } from "@/ui/icons";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconChat } from "@/ui/icons/glyphs/chat";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconChecklist } from "@/ui/icons/glyphs/checklist";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconPlay } from "@/ui/icons/glyphs/play";
import { IconResident } from "@/ui/icons/glyphs/resident";
import { IconRoom } from "@/ui/icons/glyphs/room";
import { IconWarning } from "@/ui/icons/glyphs/warning";
import { KNOWN_CATEGORY_KEYS } from "@/features/resident/requests/model";
import { ProgressSteps } from "@/features/shared/ProgressSteps";

import { LazyCostLineForm } from "./LazyCostLineForm";
import { DoorCodes } from "./DoorCodes";
import { canAddPhotos, fieldActions, type WorkOrder } from "./model";
import { WorkOrderActions } from "./WorkOrderActions";
import { LazyWorkOrderPhotos } from "./LazyWorkOrderPhotos";

/** The job's three field steps (D-072) and the status each is current in. */
const STEPS = [
  { key: "accept", icon: IconCheckCircle },
  { key: "start", icon: IconPlay },
  { key: "close", icon: IconChecklist },
] as const;

function currentStep(status: WorkOrder["status"]): number {
  if (status === "open" || status === "assigned") return 0;
  if (status === "accepted") return 1;
  if (status === "in_progress") return 2;
  return 3;
}

/**
 * One work order for its technician (L4 4.4 §2, A4.3; redesign G2 r2). Head: the problem in the resident's words as
 * the title, category · place as the lede, status and urgency. Then where the job stands (three steps), the
 * appointment (when, where, what the resident prefers, a message to them through the platform — never a phone number,
 * D-218 — and the visit's door codes, masked until revealed and audited), the resident's photos, before / after photos
 * side by side with the "one after photo to close" rule beside the after slot, parts and costs (the API's amounts),
 * the rating once done and the thread. The one next step docks on the bottom edge (`WorkOrderActions`).
 */
export async function WorkOrderDetail({ workOrder, locale }: { workOrder: WorkOrder; locale: Locale }) {
  const [t, root, cat] = await Promise.all([
    getTranslations("technician.workOrders"),
    getTranslations(),
    getTranslations("resident.requests.category"),
  ]);
  const status = WORK_ORDER_STATUS[workOrder.status];
  const photos = workOrder.photos;
  const requestPhotos = photos.filter((p) => p.role === "report");
  const open = canAddPhotos(workOrder);
  const finished = workOrder.status === "done" || workOrder.status === "verified";
  const actions = fieldActions(workOrder);
  const problem = (workOrder.requestDescription ?? workOrder.description ?? "").trim();
  const known = (KNOWN_CATEGORY_KEYS as readonly string[]).includes(workOrder.categoryKey ?? "");
  const category = known
    ? cat(workOrder.categoryKey as (typeof KNOWN_CATEGORY_KEYS)[number])
    : t(`detail.kind.${workOrder.kind}`);
  const place = workOrder.unitNo
    ? t("where", { unit: workOrder.unitNo, building: workOrder.buildingName })
    : workOrder.buildingName;
  // The title is the problem in words; a long report is clamped there and printed in full under the photos.
  const long = problem.length > 64 || problem.includes("\n");
  const uploaded = (role: "before" | "after", label: string) => {
    const list = photos.filter((p) => p.role === role);
    return list.length ? (
      <PhotoGallery
        label={label}
        testId={`wo-gallery-${role}`}
        columns={2}
        photos={list.map((p, i) => ({
          id: p.id,
          url: p.url,
          alt: t("photos.uploadedAlt", { role: label, index: i + 1 }),
        }))}
      />
    ) : null;
  };
  const needsAfter = actions.includes("complete") && workOrder.afterPhotoIds.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-4 pt-2" data-testid="work-order" data-status={workOrder.status}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={status} label={root(status.labelKey)} />
          {workOrder.priority === "urgent" || workOrder.priority === "high" ? (
            <Badge tone="warning" icon={IconWarning}>
              {t(`priority.${workOrder.priority}`)}
            </Badge>
          ) : (
            <Badge tone="neutral">{t(`priority.${workOrder.priority}`)}</Badge>
          )}
        </div>
        <h1 className="font-display line-clamp-3 text-xl leading-snug font-semibold text-pretty">
          {problem || workOrder.title}
        </h1>
        <p className="text-muted" data-testid="wo-lede">
          {t("detail.lede", { category, place })}
        </p>
      </header>

      {workOrder.status !== "cancelled" ? (
        <ProgressSteps
          label={t("detail.progress")}
          doneLabel={t("detail.stepDone")}
          current={currentStep(workOrder.status)}
          testId="wo-progress"
          steps={STEPS.map((step) => ({ key: step.key, icon: step.icon, label: t(`detail.step.${step.key}`) }))}
        />
      ) : null}

      <Card as="section" padding="none" aria-labelledby="wo-visit-title" data-testid="wo-visit">
        <h2 id="wo-visit-title" className="px-4 pt-4 font-semibold">
          {t("detail.appointment")}
        </h2>
        <ul className="flex flex-col gap-3 px-4 pt-3 pb-4">
          <li className="flex items-start gap-3">
            <Icon icon={IconCalendar} className="text-muted mt-0.5 shrink-0 text-xl" />
            <span className="tabular-nums">
              {workOrder.scheduledAt
                ? workOrder.scheduledUntil
                  ? t("when", {
                      date: formatDate(workOrder.scheduledAt, locale),
                      from: formatClock(workOrder.scheduledAt),
                      to: formatClock(workOrder.scheduledUntil),
                    })
                  : formatDateTime(workOrder.scheduledAt, locale)
                : t("detail.noVisit")}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Icon icon={IconRoom} className="text-muted mt-0.5 shrink-0 text-xl" />
            <span>{place}</span>
          </li>
          {workOrder.preferredVisit ? (
            <li className="flex items-start gap-3">
              <Icon icon={IconClock} className="text-muted mt-0.5 shrink-0 text-xl" />
              <span>
                {t("detail.preferredVisit")} {t(`detail.visitPreference.${workOrder.preferredVisit}`)}
              </span>
            </li>
          ) : null}
        </ul>
        {workOrder.serviceRequestId ? (
          <div className="border-border flex items-center gap-3 border-t px-4 py-3">
            <Icon icon={IconResident} className="text-muted shrink-0 text-xl" />
            <span className="min-w-0 flex-1">{t("detail.resident")}</span>
            <Button asChild variant="secondary" iconStart={IconChat}>
              <a href="#wo-thread" data-testid="wo-message">
                {t("detail.message")}
              </a>
            </Button>
          </div>
        ) : null}
        {open ? (
          <div className="border-border flex flex-col gap-2 border-t px-4 pt-3 pb-4">
            <h3 className="text-sm font-semibold">{t("detail.doorCodes")}</h3>
            <DoorCodes workOrderId={workOrder.id} />
          </div>
        ) : null}
      </Card>

      <Card as="section" padding="md" aria-labelledby="wo-request-photos" className="flex flex-col gap-3">
        <h2 id="wo-request-photos" className="font-semibold">
          {long ? t("detail.problem") : t("detail.requestPhotos")}
        </h2>
        {long ? <p className="whitespace-pre-line">{problem}</p> : null}
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

      <Card as="section" padding="md" aria-labelledby="wo-photos-title" className="flex flex-col gap-3">
        <h2 id="wo-photos-title" className="font-semibold">
          {t("photos.title")}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {(["before", "after"] as const).map((role) => (
            <section
              key={role}
              aria-labelledby={`wo-${role}`}
              className="flex min-w-0 flex-col gap-2 has-[[data-camera-open]]:col-span-2"
            >
              <h3 id={`wo-${role}`} className="text-sm font-semibold">
                {t(`photos.${role}`)}
              </h3>
              {uploaded(role, t(`photos.${role}`))}
              {open ? <LazyWorkOrderPhotos workOrderId={workOrder.id} role={role} /> : null}
              {role === "after" && needsAfter ? (
                <p className="text-sm font-medium" data-testid="wo-needs-photo">
                  {t("photos.afterHint")}
                </p>
              ) : (
                <p className="text-muted text-sm">
                  {role === "before" ? t("photos.beforeHint") : t("photos.afterDone")}
                </p>
              )}
            </section>
          ))}
        </div>
      </Card>

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
        {open ? <LazyCostLineForm workOrderId={workOrder.id} /> : null}
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

      <div id="wo-thread" className="scroll-mt-16">
        <LazyRequestThread
          of={{ kind: "technician", workOrderId: workOrder.id }}
          canWrite={!finished && workOrder.status !== "cancelled"}
          namespace="technician.workOrders.thread"
          withOffice={!workOrder.serviceRequestId}
        />
      </div>

      <WorkOrderActions workOrderId={workOrder.id} actions={actions} />
      {actions.length === 0 ? <div className="pb-4" /> : null}
    </div>
  );
}
