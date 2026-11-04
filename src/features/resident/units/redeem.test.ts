import { describe, expect, it } from "vitest";

import type { SignatureOtp, UnitInvitationAccepted } from "@/lib/api/types";

import {
  canVerify,
  isClosing,
  REDEEM_START,
  redeemProblem,
  redeemReducer,
  secondsUntil,
  type RedeemEvent,
  type RedeemState,
} from "./redeem";

const challenge: SignatureOtp = {
  challengeId: "c1",
  expiresAt: "2026-11-05T10:05:00+07:00",
  resendAvailableAt: "2026-11-05T10:00:30+07:00",
  phoneMasked: "+66•••••1234",
};
const accepted: UnitInvitationAccepted = {
  tenantId: "t",
  unitId: "u",
  partyId: "p",
  refreshRequired: true,
  acceptedOn: "2026-11-05",
};

function run(...events: RedeemEvent[]): RedeemState {
  return events.reduce(redeemReducer, REDEEM_START);
}
const fail = (code: string, attempts?: number): RedeemEvent => ({
  type: "failed",
  problem: redeemProblem(code, attempts),
});

describe("redeem state machine (JRL)", () => {
  it("preview → code → verifying → done", () => {
    expect(run({ type: "send" })).toEqual({ step: "sending", challenge: null });
    expect(run({ type: "send" }, { type: "sent", challenge })).toEqual({ step: "code", challenge, problem: null });
    expect(run({ type: "send" }, { type: "sent", challenge }, { type: "verify" })).toEqual({
      step: "verifying",
      challenge,
    });
    expect(
      run({ type: "send" }, { type: "sent", challenge }, { type: "verify" }, { type: "accepted", accepted }),
    ).toEqual({ step: "done", accepted });
  });

  it("a wrong code stays on the code step with the attempts left", () => {
    const state = run({ type: "send" }, { type: "sent", challenge }, { type: "verify" }, fail("auth.otp_invalid", 3));
    expect(state).toEqual({
      step: "code",
      challenge,
      problem: { kind: "wrongCode", code: "auth.otp_invalid", attemptsRemaining: 3 },
    });
    expect(canVerify(state, "123456")).toBe(true);
  });

  it("an expired or used-up code cannot be sent again; a resend gives a fresh code step", () => {
    for (const code of ["auth.otp_expired", "auth.otp_attempts_exceeded"]) {
      const state = run({ type: "send" }, { type: "sent", challenge }, { type: "verify" }, fail(code));
      expect(state.step).toBe("code");
      expect(canVerify(state, "123456")).toBe(false);
      const fresh = { ...challenge, challengeId: "c2" };
      expect(redeemReducer(redeemReducer(state, { type: "send" }), { type: "sent", challenge: fresh })).toEqual({
        step: "code",
        challenge: fresh,
        problem: null,
      });
    }
  });

  it("a rate-limited first send goes back to the preview; a rate-limited resend keeps the code already sent", () => {
    expect(run({ type: "send" }, fail("auth.otp_rate_limited"))).toEqual({
      step: "preview",
      problem: { kind: "rateLimited", code: "auth.otp_rate_limited" },
    });
    expect(run({ type: "send" }, { type: "sent", challenge }, { type: "send" }, fail("auth.otp_rate_limited"))).toEqual(
      {
        step: "code",
        challenge,
        problem: { kind: "rateLimited", code: "auth.otp_rate_limited" },
      },
    );
  });

  it("invitation problems close the flow wherever they happen", () => {
    expect(run({ type: "send" }, fail("invitation.phone_missing")).step).toBe("closed");
    expect(
      run({ type: "send" }, { type: "sent", challenge }, { type: "verify" }, fail("invitation.not_pending")),
    ).toEqual({ step: "closed", problem: { kind: "notPending", code: "invitation.not_pending" } });
    expect(
      run({ type: "send" }, { type: "sent", challenge }, { type: "verify" }, fail("invitation.party_mismatch")).step,
    ).toBe("closed");
  });

  it("ignores events that do not fit the step (double taps, late answers)", () => {
    const sending = run({ type: "send" });
    expect(redeemReducer(sending, { type: "send" })).toBe(sending);
    expect(redeemReducer(REDEEM_START, { type: "verify" })).toBe(REDEEM_START);
    expect(redeemReducer(REDEEM_START, { type: "accepted", accepted })).toBe(REDEEM_START);
    const done = run({ type: "send" }, { type: "sent", challenge }, { type: "verify" }, { type: "accepted", accepted });
    expect(redeemReducer(done, fail("auth.otp_invalid", 1))).toBe(done);
  });

  it("maps every documented error to its own words", () => {
    expect(
      [
        "invitation.not_found",
        "invitation.not_pending",
        "invitation.party_mismatch",
        "invitation.phone_missing",
        "consent.required",
        "auth.otp_invalid",
        "auth.otp_expired",
        "auth.otp_attempts_exceeded",
        "auth.otp_rate_limited",
        "internal.unexpected",
      ].map((code) => redeemProblem(code).kind),
    ).toEqual([
      "notFound",
      "notPending",
      "partyMismatch",
      "phoneMissing",
      "consent",
      "wrongCode",
      "codeExpired",
      "tooManyAttempts",
      "rateLimited",
      "other",
    ]);
    expect(["notFound", "notPending", "partyMismatch", "phoneMissing"].every((k) => isClosing(k as never))).toBe(true);
    expect(isClosing("wrongCode")).toBe(false);
  });

  it("counts down to the resend time", () => {
    const now = Date.parse("2026-11-05T10:00:00+07:00");
    expect(secondsUntil(challenge.resendAvailableAt, now)).toBe(30);
    expect(secondsUntil(challenge.resendAvailableAt, now + 60_000)).toBe(0);
    expect(secondsUntil(null, now)).toBe(0);
    expect(secondsUntil("not a date", now)).toBe(0);
  });
});
