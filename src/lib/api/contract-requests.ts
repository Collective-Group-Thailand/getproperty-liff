/**
 * Shapes this app needs and getproperty-api's contract (`57eef37`, B5) does not publish yet — docs/contract-requests.md
 * #22–#28. Each is mocked in `mocks/contract-requests.ts` and read only where a `CONTRACT-REQUEST` comment says so;
 * the screens work without them (they show what the contract has). Delete a type here when `pnpm gen:api --adopt`
 * brings the contract's own.
 */
import type { Schemas } from "./types";

/** #22 — a 5-minute link to one photo of a request (the report's, or the technician's before / after ones). */
export interface RequestPhotoLink {
  id: string;
  role: "report" | "before" | "after";
  url: string;
}

/** #22 — one transition of the request's workflow instance (D-159), oldest first. */
export interface RequestStatusEvent {
  status: Schemas["ServiceRequestStatus"];
  at: string;
}

/** #22 — the SLA clock as the API keeps it (D-210): paused while waiting for parts, none once done. */
export interface RequestSla {
  dueAt: string | null;
  state: "on_track" | "at_risk" | "breached" | "paused" | "none";
}

/**
 * #22 / #24 — what the request page shows beyond `ResidentServiceRequestDto`: photo links, the status history,
 * the SLA state, the visit the resident may confirm (`confirm-visit` in `nextActions`).
 */
export interface ServiceRequestRequestedFields {
  photos?: RequestPhotoLink[];
  events?: RequestStatusEvent[];
  sla?: RequestSla | null;
  visitConfirmedAt?: string | null;
}
export type ServiceRequestView = Schemas["ResidentServiceRequestDto"] & ServiceRequestRequestedFields;

/** #24 — the resident's preferred visit time, sent with the request. */
export type PreferredVisit = "anytime" | "morning" | "afternoon" | "evening";
export const PREFERRED_VISITS: readonly PreferredVisit[] = ["anytime", "morning", "afternoon", "evening"];

/** #23 — one message on a request's thread (resident ↔ office ↔ technician), never a phone number. */
export interface ThreadMessage {
  id: string;
  author: "resident" | "office" | "technician" | "system";
  authorName: string;
  body: string;
  createdAt: string;
  mine: boolean;
}
export interface ThreadMessages {
  data: ThreadMessage[];
}

/** #25 — the technician's view of the photos (5-minute links) and the resident's rating once closed. */
export interface WorkOrderRequestedFields {
  photos?: RequestPhotoLink[];
  rating?: number | null;
  ratingComment?: string | null;
}
export type WorkOrderView = Schemas["TechnicianWorkOrderDto"] & WorkOrderRequestedFields;

/** #26 — whether the operator lets residents create visitor codes, and how long one may last. */
export interface VisitorPolicy {
  allowed: boolean;
  maxHours: number;
}
export type CredentialsView = Schemas["RevealedCredentialsDto"] & { visitorPolicy?: VisitorPolicy };

/** #26 — `POST /v1/resident/access/visitor-codes`. */
export interface VisitorCodeCreate {
  unitId: string;
  visitorName: string;
  validFrom: string;
  validTo: string;
}

/** #27 — the menus B5 added without an entitlement (facilities, access). */
export type RequestedEntitlement = "facilities" | "access";
