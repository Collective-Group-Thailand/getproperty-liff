/**
 * Shapes of what this app needs and the contract does not publish yet (docs/contract-requests.md #7–#11). Each
 * is mocked in `mocks/contract-requests.ts` / `mocks/resident.ts` and read only where a `CONTRACT-REQUEST`
 * comment says so; delete a type here when `pnpm gen:api --adopt` brings the contract's own.
 */
import type { ResidentDeduction, ResidentDeposit, ResidentLease } from "./types";

/** CONTRACT-REQUEST #7 / #8 — fields the lease view needs on `ResidentLeaseDto`. */
export interface LeaseRequestedFields {
  /** #7: the earliest move-out date the API accepts for a notice given today (ข้อ 4 (11)); computed by the API. */
  noticeEarliestDate?: string | null;
  /** #8: when I acknowledged the building rules of this lease. */
  rulesAcknowledgedAt?: string | null;
}
export type LeaseView = ResidentLease & LeaseRequestedFields;

/** CONTRACT-REQUEST #9 — the move-in photos of the same item, beside the move-out evidence. */
export type DeductionView = ResidentDeduction & { beforeEvidenceUrls?: string[] };
export type DepositView = Omit<ResidentDeposit, "deductions"> & { deductions: DeductionView[] };

/** CONTRACT-REQUEST #9 — `POST /v1/resident/uploads` (presigned upload of a dispute photo). */
export interface UploadPresign {
  fileId: string;
  uploadUrl: string;
  method: "PUT";
  headers?: Record<string, string>;
  expiresAt: string;
}

/** CONTRACT-REQUEST #10 — `GET/PUT /v1/resident/me/notification-preferences`. */
export type NotificationTopic = "billing" | "lease" | "service_requests" | "announcements" | "parcels";
export interface NotificationPreference {
  topic: NotificationTopic;
  line: boolean;
  sms: boolean;
  /** Legally required notices (bills, lease notices) cannot be switched off. */
  locked: boolean;
}
export interface NotificationPreferences {
  items: NotificationPreference[];
}

/** CONTRACT-REQUEST #11 — `GET /v1/resident/documents` and `…/{documentId}/download`. */
export interface ResidentDocument {
  id: string;
  kind: "lease_contract" | "lease_notice" | "deposit_statement" | "receipt";
  title: string;
  createdAt: string;
  leaseId: string | null;
}
export interface DocumentDownload {
  url: string;
  expiresAt: string;
}
