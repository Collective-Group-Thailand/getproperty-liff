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

/**
 * Menu entitlements of the resident (contract §4 lists "menu entitlements" in `/me`).
 * CONTRACT-REQUEST: `ResidentMeDto.entitlements` is not in the contract yet (docs/contract-requests.md #2);
 * the keys are this app's menu entries.
 */
export const RESIDENT_ENTITLEMENTS = [
  "bills",
  "usage",
  "service_requests",
  "lease",
  "announcements",
  "parcels",
] as const;
export type ResidentEntitlement = (typeof RESIDENT_ENTITLEMENTS)[number];

/** `/v1/resident/me` as this app reads it. */
export type ResidentMe = Schemas["ResidentMeDto"] & {
  /** CONTRACT-REQUEST #2 — absent from the contract today; see `entitlementsOf()`. */
  entitlements?: string[];
};

/**
 * CONTRACT-REQUEST #1 (`POST /v1/resident/link`, docs/contract-requests.md): accepting an operator's invitation
 * code links the signed-in resident to the invited party and answers with the units they now occupy.
 */
export interface InvitationAcceptBody {
  code: string;
}
export interface InvitationAccepted {
  units: ResidentUnit[];
}
