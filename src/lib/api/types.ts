import type { components, paths } from "./schema";

/**
 * Names for the generated contract types (`schema.d.ts`, `pnpm gen:api`). Nothing here describes a shape the
 * contract does not publish — fields this app needs and the contract lacks are listed in
 * `docs/contract-requests.md` and marked `CONTRACT-REQUEST` where they are read.
 */
export type Schemas = components["schemas"];
export type ApiPaths = paths;

/**
 * A contract enum by schema name, or the fallback while the contract does not publish it yet. When the API
 * adds the schema, the generated type takes over and every `Record<Enum, …>` built from it must cover the new
 * values — a new backend value fails the build until it has a label, tone and icon (master plan §5).
 */
export type ContractEnum<Name extends string, Fallback extends string> = Name extends keyof Schemas
  ? Schemas[Name] extends string
    ? Schemas[Name]
    : Fallback
  : Fallback;

export type ProblemBody = Schemas["ProblemDetails"];
export type ProblemFieldError = Schemas["ProblemFieldError"];
export type TokenPair = Schemas["TokenPairDto"];
export type Subject = Schemas["SubjectDto"];
export type ResidentUnit = Schemas["ResidentUnitDto"];
export type ConsentPurpose = Schemas["ConsentPurposeDto"];
export type ConsentCapture = Schemas["ConsentCaptureDto"];
export type OtpChallenge = Schemas["OtpChallengeDto"];
export type TechnicianMe = Schemas["TechnicianMeDto"];
export type RealtimeAuth = Schemas["RealtimeAuthDto"];

/** Menu entitlements of the resident (`ResidentMeDto.entitlements`, D-063); the keys are this app's menu entries. */
export type ResidentEntitlement = Schemas["ResidentEntitlement"];
export const RESIDENT_ENTITLEMENTS = [
  "bills",
  "usage",
  "service_requests",
  "lease",
  "announcements",
  "parcels",
] as const satisfies readonly ResidentEntitlement[];

/** `/v1/resident/me` as this app reads it. */
export type ResidentMe = Schemas["ResidentMeDto"];
export type ResidentLeaseSummary = Schemas["ResidentLeaseSummaryDto"];
export type ResidentLanguage = Schemas["ResidentLanguage"];

/** `POST /v1/resident/link` (D-061): the invitation code from the invite QR/SMS deep link. */
export type ResidentLinkBody = Schemas["ResidentLinkDto"];
export type ResidentLinked = Schemas["ResidentLinkedDto"];

// L3 — lease, e-signature, notice, deposit, usage, profile & privacy (B2.3, B2.4, B3.2, B1.3).
export type ResidentLease = Schemas["ResidentLeaseDto"];
export type LeaseParty = Schemas["LeasePartyViewDto"];
export type LeaseLine = Schemas["LeaseLineDto"];
export type AddendumClause = Schemas["AddendumClauseDto"];
export type ContractDownload = Schemas["ContractDownloadDto"];
export type SignatureOtp = Schemas["ResidentSignatureOtpDto"];
export type ResidentDeposit = Schemas["ResidentDepositDto"];
export type ResidentDeduction = Schemas["ResidentDeductionDto"];
export type Settlement = Schemas["SettlementDto"];
export type ResidentUsage = Schemas["ResidentUsageDto"];
export type UtilityUsage = Schemas["UtilityUsageDto"];
export type UsagePoint = Schemas["UsagePointDto"];
export type SeriesBucket = Schemas["SeriesBucket"];
export type ResidentPrivacy = Schemas["ResidentPrivacyDto"];
export type Dsr = Schemas["DsrDto"];
export type DsrKind = Schemas["DsrKind"];
export type DsrCreate = Schemas["DsrCreateDto"];

// L2 — invoices, pay, slips, receipts (B4.2, B4.4).
export type ResidentInvoice = Schemas["ResidentInvoiceDto"];
export type ResidentInvoiceLine = Schemas["ResidentInvoiceLineDto"];
export type InvoiceLineKind = Schemas["InvoiceLineKind"];
export type InvoiceLineSourceType = Schemas["InvoiceLineSourceType"];
export type ResidentPayment = Schemas["ResidentPaymentDto"];
export type ResidentQr = Schemas["ResidentQrDto"];
export type ResidentAccount = Schemas["ResidentAccountDto"];
export type SlipMimeType = Schemas["SlipMimeType"];
export type ResidentSlipResult = Schemas["ResidentSlipResultDto"];
export type ResidentReceipt = Schemas["ResidentReceiptDto"];
export type ReceiptKind = Schemas["ReceiptKind"];
export type DocumentLink = Schemas["DocumentDownloadDto"];
export type PageMeta = Schemas["PageMeta"];
export type InboxItem = Schemas["InboxItemDto"];

// Closed contract requests #7–#21 (getproperty-api A6 `D-203`, F2 `D-208`/`D-209`; adopted at 57eef37).
export type LeaseView = ResidentLease;
export type DeductionView = ResidentDeduction;
export type DepositView = ResidentDeposit;
export type UploadPresign = Schemas["ResidentUploadedDto"];
export type UploadRequest = Schemas["ResidentUploadDto"];
export type UploadContentType = Schemas["ResidentUploadContentType"];
export type NotificationTopic = Schemas["NotificationTopic"];
export type NotificationPreference = Schemas["NotificationTopicPreferenceDto"];
export type NotificationPreferences = Schemas["NotificationPreferencesDto"];
export type ResidentDocument = Schemas["ResidentDocumentDto"];
export type DocumentDownload = Schemas["ResidentDocumentDownloadDto"];
export type InvoiceLineView = ResidentInvoiceLine;
export type ReceiptRef = Schemas["DocumentRefDto"];
export type InvoiceView = ResidentInvoice;
export type SlipReason = Schemas["SlipReason"];
export type SlipView = Schemas["ResidentSlipOutcomeDto"];
export type ReceiptView = Schemas["ResidentReceiptDetailDto"];
