import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";

export type ResidentReview = Schemas["ResidentReviewDto"];
export type MyReview = Schemas["MyReviewDto"];
export type ReviewEligibility = Schemas["ReviewEligibilityDto"];
export type ReviewLanguage = Schemas["ResidentLanguage"];

/** The contract's limits of `ReviewSubmitDto.body` (10–2000 characters) and `rating` (1–5). */
export const BODY_MIN = 10;
export const BODY_MAX = 2000;
export const RATINGS = [1, 2, 3, 4, 5] as const;

/**
 * What the lease page offers (D-301):
 * - `mine`: I wrote one — its state;
 * - `write`: verified tenure, nothing written yet;
 * - `wait`: too early — from `eligibleFrom`;
 * - `none`: never lived under this lease (or only as a guarantor) / the window after moving out closed.
 */
export type ReviewEntry =
  | { kind: "mine"; review: MyReview }
  | { kind: "write" }
  | { kind: "wait"; from: string | null }
  | { kind: "none"; reason: Schemas["ReviewIneligibleReason"] | null };

export function reviewEntry(view: Pick<ResidentReview, "eligibility" | "review">): ReviewEntry {
  if (view.review) return { kind: "mine", review: view.review };
  if (view.eligibility.eligible) return { kind: "write" };
  if (view.eligibility.reason === "too_early") return { kind: "wait", from: view.eligibility.eligibleFrom };
  return { kind: "none", reason: view.eligibility.reason };
}

/** Characters as the API counts them (`minLength` / `maxLength` of the trimmed text). */
export function textLength(text: string): number {
  return text.trim().length;
}

export type ReviewField = "rating" | "body" | "consent";

export interface ReviewDraft {
  rating: number | null;
  body: string;
}

/** Checks before sending; the API decides the rest (eligibility, personal data, the consent version). */
export function reviewProblems(draft: ReviewDraft, accepted: boolean): ReviewField[] {
  const problems: ReviewField[] = [];
  if (draft.rating === null) problems.push("rating");
  const length = textLength(draft.body);
  if (length < BODY_MIN || length > BODY_MAX) problems.push("body");
  if (!accepted) problems.push("consent");
  return problems;
}

/** The `POST …/review` body: the version I ticked now — never by default (D-025, D-301). */
export function submitBody(draft: ReviewDraft, consentVersion: number, locale: Locale): Schemas["ReviewSubmitDto"] {
  return { rating: draft.rating!, body: draft.body.trim(), language: locale, consentVersion };
}

/** States in which the review can still be taken down by me (withdrawn is final). */
export function canWithdraw(review: Pick<MyReview, "state">): boolean {
  return review.state !== "withdrawn";
}
