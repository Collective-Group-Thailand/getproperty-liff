import { getTranslations } from "next-intl/server";

import { SERVICE_REQUEST_STATUS } from "@/domain/status/serviceRequest";
import { PhotoGallery } from "@/features/shared/PhotoGallery";
import { RequestThread } from "@/features/shared/RequestThread";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ServiceRequestView } from "@/lib/api/contract-requests";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { DescriptionList } from "@/ui/components/DescriptionList";
import { Timeline, type TimelineEvent } from "@/ui/components/Timeline";
import { Icon } from "@/ui/icons";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconClock } from "@/ui/icons/glyphs/clock";

import { categoryName, isOpenRequest, photosOf, timelineOf } from "./model";
import { CancelRequest, ConfirmVisit, RateRequest } from "./RequestActions";

/**
 * One repair request (L4 4.1 §2): status, what was reported, the warranty referral when the API made one (D-153 —
 * shown, never decided here), the SLA as the API reports it, the planned visit (with its confirmation), photos, the
 * status timeline (`Timeline`, every `ServiceRequestStatus`), the thread, and the actions the API offers
 * (`nextActions`: `cancel`, `rate`; CONTRACT-REQUEST #24 `confirm-visit`). The rating, once given, is shown.
 */
export async function RequestDetail({ request, locale }: { request: ServiceRequestView; locale: Locale }) {
  const [t, root, cat] = await Promise.all([
    getTranslations("resident.requests"),
    getTranslations(),
    getTranslations("resident.requests.category"),
  ]);
  const status = SERVICE_REQUEST_STATUS[request.status];
  const actions = new Set(request.nextActions);
  const photos = photosOf(request);
  const steps = timelineOf(request);
  const events: TimelineEvent[] = steps.map((step, index) => {
    const meta = SERVICE_REQUEST_STATUS[step.status];
    return {
      id: `${step.status}-${index}`,
      title: t(`detail.event.${step.status}`),
      time: step.at ? formatDateTime(step.at, locale) : t("detail.unknownTime"),
      icon: meta.icon,
      tone: meta.tone === "info" ? "primary" : meta.tone === "neutral" ? "neutral" : meta.tone,
    };
  });

  return (
    <div className="flex flex-col gap-4 py-5" data-testid="request-detail" data-status={request.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">{t("detail.title", { ref: request.ref })}</h1>
        <StatusBadge status={status} label={root(status.labelKey)} />
      </div>

      {request.inWarranty ? (
        <div data-testid="request-warranty">
          <Callout tone="info" title={t("detail.warrantyTitle")}>
            {t("detail.warrantyBody")}
          </Callout>
        </div>
      ) : null}

      <Card as="section" padding="md" aria-label={t("detail.description")}>
        <DescriptionList
          columns={1}
          items={[
            {
              id: "category",
              term: t("detail.category"),
              description: categoryName(request.category, locale, (key) => cat(key)),
            },
            { id: "unit", term: t("detail.unit"), description: request.unitNo },
            { id: "reported", term: t("detail.reported"), description: formatDateTime(request.createdAt, locale) },
            {
              id: "priority",
              term: t("detail.priority"),
              description:
                request.priority === "low" ? t("new.priority.normal") : t(`new.priority.${request.priority}`),
            },
            {
              id: "description",
              term: t("detail.description"),
              description: <span className="whitespace-pre-line">{request.description}</span>,
            },
          ]}
        />
      </Card>

      {/* CONTRACT-REQUEST #22: the SLA state only when the API reports it. */}
      {request.sla && request.sla.state !== "none" ? (
        <div data-testid="request-sla" data-state={request.sla.state}>
          <Callout
            tone={request.sla.state === "breached" || request.sla.state === "at_risk" ? "warning" : "neutral"}
            title={t("detail.sla.title")}
            icon={IconClock}
          >
            {t(`detail.sla.${request.sla.state}`, {
              date: request.sla.dueAt ? formatDateTime(request.sla.dueAt, locale) : "",
            })}
          </Callout>
        </div>
      ) : null}

      {request.visitAt && isOpenRequest(request) ? (
        <Card as="section" padding="md" aria-labelledby="visit-title" data-testid="request-visit">
          <h2 id="visit-title" className="flex items-center gap-2 font-semibold">
            <Icon icon={IconCalendar} />
            {t("detail.visitTitle")}
          </h2>
          <p className="mt-1">{t("detail.visitAt", { date: formatDateTime(request.visitAt, locale) })}</p>
          {request.visitConfirmedAt ? (
            <p className="text-success-subtle-fg mt-1 text-sm font-medium" data-testid="request-visit-confirmed">
              {t("detail.visitConfirmed")}
            </p>
          ) : null}
          {/* CONTRACT-REQUEST #24: offered by the API as `confirm-visit`. */}
          {actions.has("confirm-visit") ? <ConfirmVisit serviceRequestId={request.id} /> : null}
        </Card>
      ) : null}

      {actions.has("rate") ? <RateRequest serviceRequestId={request.id} /> : null}
      {request.rating ? (
        <Card as="section" padding="md" data-testid="request-rating">
          <p className="font-medium">
            <span aria-hidden="true" className="text-primary me-2">
              {"★".repeat(request.rating)}
            </span>
            {t("detail.ratingShown", { rating: request.rating })}
          </p>
          {request.ratingComment ? (
            <p className="text-muted mt-1">{t("detail.ratingComment", { comment: request.ratingComment })}</p>
          ) : null}
        </Card>
      ) : null}

      <Card as="section" padding="md" aria-labelledby="photos-title">
        <h2 id="photos-title" className="mb-2 font-semibold">
          {t("detail.photos")}
        </h2>
        {photos.report.length || photos.after.length ? (
          <div className="flex flex-col gap-3">
            {photos.report.length ? (
              <PhotoGallery
                label={t("detail.photos")}
                testId="request-photos"
                photos={photos.report.map((p, i) => ({
                  id: p.id,
                  url: p.url,
                  alt: t("detail.photoReport", { index: i + 1 }),
                }))}
              />
            ) : null}
            {photos.after.length ? (
              <PhotoGallery
                label={t("detail.photos")}
                testId="request-after-photos"
                photos={photos.after.map((p, i) => ({
                  id: p.id,
                  url: p.url,
                  alt: t("detail.photoAfter", { index: i + 1 }),
                }))}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-muted text-sm" data-testid="request-photo-count">
            {t("detail.photoCount", { count: request.photoIds.length })}
          </p>
        )}
      </Card>

      <Card as="section" padding="md" aria-labelledby="timeline-title" data-testid="request-timeline">
        <h2 id="timeline-title" className="mb-4 font-semibold">
          {t("detail.timeline")}
        </h2>
        <Timeline events={events} />
      </Card>

      <RequestThread
        path={`/v1/resident/service-requests/${request.id}/messages`}
        canWrite={request.status !== "closed" && request.status !== "cancelled"}
        namespace="resident.requests.thread"
      />

      {actions.has("cancel") ? <CancelRequest serviceRequestId={request.id} /> : null}
    </div>
  );
}
