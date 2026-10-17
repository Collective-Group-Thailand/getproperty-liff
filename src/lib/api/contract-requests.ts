/**
 * Shapes of what this app needs and the contract does not publish yet (docs/contract-requests.md #7–#11, #15–#19). Each
 * is mocked in `mocks/contract-requests.ts` / `mocks/resident.ts` and read only where a `CONTRACT-REQUEST`
 * comment says so; delete a type here when `pnpm gen:api --adopt` brings the contract's own.
 */
import type {
  InvoiceLineSourceType,
  ResidentDeduction,
  ResidentDeposit,
  ResidentInvoice,
  ResidentInvoiceLine,
  ResidentLease,
  ResidentReceipt,
  ResidentSlipResult,
} from "./types";

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

/**
 * CONTRACT-REQUEST #15 — the disclosure of each line (D-012, D-022): its `sourceType` (the contract groups
 * by it on the owner side), when the closing reading was taken and the photo of the register when one exists
 * (a 5-minute link); and the invoice's `unitId`. Read only when the API sends them.
 */
export interface InvoiceLineRequestedFields {
  sourceType?: InvoiceLineSourceType;
  readAt?: string | null;
  readingPhotoUrl?: string | null;
}
export type InvoiceLineView = ResidentInvoiceLine & InvoiceLineRequestedFields;

/** CONTRACT-REQUEST #19 — the receipts of the payments of an invoice (paid → "your receipt"). */
export interface ReceiptRef {
  id: string;
  number: string;
}
export type InvoiceView = Omit<ResidentInvoice, "lines"> & {
  lines: InvoiceLineView[];
  unitId?: string;
  receipts?: ReceiptRef[];
};

/** CONTRACT-REQUEST #17 — `GET /v1/resident/invoices/{invoiceId}/slips`: my slips with the verification outcome. */
export type SlipReason =
  | "not_recognised"
  | "duplicate_reference"
  | "receiver_mismatch"
  | "amount_above_due"
  | "amount_below_due"
  | "amount_unreadable";
export interface SlipView {
  id: string;
  status: ResidentSlipResult["status"];
  reasons: SlipReason[];
  uploadedAt: string;
  decidedAt: string | null;
}

/** CONTRACT-REQUEST #19 — `GET /v1/resident/receipts/{receiptId}` with the invoices it paid. */
export type ReceiptView = ResidentReceipt & { invoices?: ReceiptRef[] };
