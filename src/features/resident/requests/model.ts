import type { RequestStatusEvent, ServiceRequestView } from "@/lib/api/contract-requests";
import type { Schemas } from "@/lib/api/types";
import type { Locale } from "@/i18n/routing";

export type ServiceRequest = Schemas["ResidentServiceRequestDto"];
export type ServiceCategory = Schemas["ServiceCategoryDto"];
export type ServiceRequestStatus = Schemas["ServiceRequestStatus"];

/** The statuses of a request still being worked on (getproperty-api `OPEN_REQUEST_STATUSES`). */
export const OPEN_STATUSES: readonly ServiceRequestStatus[] = [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "waiting_parts",
];

export function isOpenRequest(request: Pick<ServiceRequest, "status">): boolean {
  return OPEN_STATUSES.includes(request.status);
}

/** The urgencies a resident chooses from (`ServicePriority`; `low` is the office's own triage value). */
export const RESIDENT_PRIORITIES = [
  "normal",
  "high",
  "urgent",
] as const satisfies readonly Schemas["ServicePriority"][];

/** Platform category keys this app has its own words for (getproperty-api `DEFAULT_SERVICE_CATEGORIES`, D-072). */
export const KNOWN_CATEGORY_KEYS = [
  "electrical",
  "plumbing",
  "aircon",
  "appliance",
  "structure",
  "pest",
  "cleaning",
  "other",
] as const;

/**
 * A category's name in the reader's language: the landlord's own Thai or English name (a tenant may rename a key),
 * and for my/km/lo/zh the app's translation of a platform key (`translate`), else the English name.
 */
export function categoryName(
  category: Pick<ServiceCategory, "key" | "nameTh" | "nameEn">,
  locale: Locale,
  translate: (key: (typeof KNOWN_CATEGORY_KEYS)[number]) => string,
): string {
  if (locale === "th") return category.nameTh;
  if (locale === "en") return category.nameEn;
  return (KNOWN_CATEGORY_KEYS as readonly string[]).includes(category.key)
    ? translate(category.key as (typeof KNOWN_CATEGORY_KEYS)[number])
    : category.nameEn;
}

/** Open requests first (newest first, as the API lists them), then the rest. */
export function splitRequests<T extends Pick<ServiceRequest, "status">>(
  requests: readonly T[],
): { open: T[]; past: T[] } {
  return {
    open: requests.filter((r) => isOpenRequest(r)),
    past: requests.filter((r) => !isOpenRequest(r)),
  };
}

export interface TimelineStep {
  status: ServiceRequestStatus;
  /** When it happened, as the API says; `null` when the API does not say (the step is still shown). */
  at: string | null;
}

/**
 * The status history the page shows, oldest first. The API's workflow events when it sends them (CONTRACT-REQUEST
 * #22, D-159); otherwise the steps the request's own timestamps prove — reported (`createdAt`), done (`doneAt`),
 * closed or cancelled (`closedAt`) — plus the current status, so every `ServiceRequestStatus` renders. Nothing is
 * inferred beyond what the API returned.
 */
export function timelineOf(
  request: Pick<ServiceRequest, "status" | "createdAt" | "doneAt" | "closedAt"> & { events?: RequestStatusEvent[] },
): TimelineStep[] {
  if (request.events?.length) return request.events.map((e) => ({ status: e.status, at: e.at }));
  const steps: TimelineStep[] = [{ status: "new", at: request.createdAt }];
  if (request.doneAt) steps.push({ status: "done", at: request.doneAt });
  if (request.status === "closed" || request.status === "cancelled") {
    steps.push({ status: request.status, at: request.closedAt });
  } else if (!steps.some((s) => s.status === request.status)) {
    steps.push({ status: request.status, at: null });
  }
  return steps;
}

/** The photo links the API sent (CONTRACT-REQUEST #22), split into what the resident sent and the after photos. */
export function photosOf(request: ServiceRequestView) {
  const photos = request.photos ?? [];
  return {
    report: photos.filter((p) => p.role === "report"),
    after: photos.filter((p) => p.role === "after"),
  };
}

export const MAX_REQUEST_PHOTOS = 10;
