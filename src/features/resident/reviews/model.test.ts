import { describe, expect, it } from "vitest";

import { BODY_MAX, canWithdraw, reviewEntry, reviewProblems, submitBody, type MyReview } from "./model";

const eligibility = (over = {}) => ({ eligible: false, reason: null, eligibleFrom: null, tenure: null, ...over });
const review = { id: "r", state: "pending_moderation" } as MyReview;

describe("review model (GL4, D-301)", () => {
  it("says what the lease page offers", () => {
    expect(reviewEntry({ eligibility: eligibility({ eligible: true }), review: null })).toEqual({ kind: "write" });
    expect(
      reviewEntry({ eligibility: eligibility({ reason: "too_early", eligibleFrom: "2027-02-01" }), review: null }),
    ).toEqual({ kind: "wait", from: "2027-02-01" });
    expect(reviewEntry({ eligibility: eligibility({ reason: "not_started" }), review: null })).toEqual({
      kind: "none",
      reason: "not_started",
    });
    expect(reviewEntry({ eligibility: eligibility({ reason: "window_closed" }), review })).toEqual({
      kind: "mine",
      review,
    });
  });

  it("checks rating, length and the consent box before sending; the consent is never assumed", () => {
    expect(reviewProblems({ rating: null, body: "short" }, false)).toEqual(["rating", "body", "consent"]);
    expect(reviewProblems({ rating: 4, body: "   ตึกสะอาดมากค่ะ   " }, true)).toEqual([]);
    expect(reviewProblems({ rating: 4, body: "x".repeat(BODY_MAX + 1) }, true)).toEqual(["body"]);
    expect(reviewProblems({ rating: 5, body: "ตึกสะอาดมากค่ะ" }, false)).toEqual(["consent"]);
  });

  it("sends the trimmed text, the page language and the version ticked now", () => {
    expect(submitBody({ rating: 3, body: "  ลิฟต์เร็ว ที่จอดน้อย  " }, 2, "my")).toEqual({
      rating: 3,
      body: "ลิฟต์เร็ว ที่จอดน้อย",
      language: "my",
      consentVersion: 2,
    });
  });

  it("allows withdrawal until it is withdrawn (final)", () => {
    expect(canWithdraw({ state: "published" })).toBe(true);
    expect(canWithdraw({ state: "rejected" })).toBe(true);
    expect(canWithdraw({ state: "withdrawn" })).toBe(false);
  });
});
