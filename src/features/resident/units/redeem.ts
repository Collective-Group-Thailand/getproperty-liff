import type { SignatureOtp, UnitInvitationAccepted } from "@/lib/api/types";

/**
 * Redeeming a co-owner's unit invitation (JRL, D-322) as a small state machine, so every API answer has one designed
 * place: preview → send the code (to the register's phone, never one I type) → six digits → linked.
 *
 *   preview ──send──▶ sending ──sent──▶ code ──verify──▶ verifying ──accepted──▶ done
 *      ▲                 │               ▲  │                │
 *      └──── problem ◀───┘               │  └── resend ──▶ sending
 *                                        └──── wrong code (attempts left) ◀──┘
 *
 * A problem about the invitation itself ends the flow (`closed`); a problem about the code keeps the resident where
 * they can fix it.
 */
export type RedeemProblemKind =
  | "notFound"
  | "notPending"
  | "partyMismatch"
  | "phoneMissing"
  | "consent"
  | "wrongCode"
  | "codeExpired"
  | "tooManyAttempts"
  | "rateLimited"
  | "other";

export interface RedeemProblem {
  kind: RedeemProblemKind;
  code: string;
  /** `auth.otp_invalid`: tries left with this code. */
  attemptsRemaining?: number;
}

/** Invitation problems: nothing the resident can do here but ask the office (or use the code of another invite). */
const CLOSING: ReadonlySet<RedeemProblemKind> = new Set(["notFound", "notPending", "partyMismatch", "phoneMissing"]);

export function isClosing(kind: RedeemProblemKind): boolean {
  return CLOSING.has(kind);
}

export function redeemProblem(code: string | undefined, attemptsRemaining?: unknown): RedeemProblem {
  const c = code ?? "";
  const kind: RedeemProblemKind =
    c === "invitation.not_found"
      ? "notFound"
      : c === "invitation.not_pending"
        ? "notPending"
        : c === "invitation.party_mismatch"
          ? "partyMismatch"
          : c === "invitation.phone_missing"
            ? "phoneMissing"
            : c === "consent.required"
              ? "consent"
              : c === "auth.otp_invalid"
                ? "wrongCode"
                : c === "auth.otp_expired"
                  ? "codeExpired"
                  : c === "auth.otp_attempts_exceeded"
                    ? "tooManyAttempts"
                    : c === "auth.otp_rate_limited" || c === "http.too_many_requests"
                      ? "rateLimited"
                      : "other";
  return typeof attemptsRemaining === "number" && kind === "wrongCode"
    ? { kind, code: c, attemptsRemaining }
    : { kind, code: c };
}

export type RedeemState =
  | { step: "preview"; problem: RedeemProblem | null }
  | { step: "sending"; challenge: SignatureOtp | null }
  | { step: "code"; challenge: SignatureOtp; problem: RedeemProblem | null }
  | { step: "verifying"; challenge: SignatureOtp }
  | { step: "done"; accepted: UnitInvitationAccepted }
  | { step: "closed"; problem: RedeemProblem };

export type RedeemEvent =
  | { type: "send" }
  | { type: "sent"; challenge: SignatureOtp }
  | { type: "verify" }
  | { type: "accepted"; accepted: UnitInvitationAccepted }
  | { type: "failed"; problem: RedeemProblem };

export const REDEEM_START: RedeemState = { step: "preview", problem: null };

export function redeemReducer(state: RedeemState, event: RedeemEvent): RedeemState {
  switch (event.type) {
    case "send":
      // From the preview (first code) or the code step (resend); never twice at once.
      if (state.step === "preview") return { step: "sending", challenge: null };
      if (state.step === "code") return { step: "sending", challenge: state.challenge };
      return state;
    case "sent":
      return state.step === "sending" ? { step: "code", challenge: event.challenge, problem: null } : state;
    case "verify":
      return state.step === "code" ? { step: "verifying", challenge: state.challenge } : state;
    case "accepted":
      return state.step === "verifying" ? { step: "done", accepted: event.accepted } : state;
    case "failed": {
      const { problem } = event;
      if (isClosing(problem.kind)) return { step: "closed", problem };
      if (state.step === "sending") {
        // A resend that failed keeps the code already sent (it may still be valid); a first send goes back.
        return state.challenge ? { step: "code", challenge: state.challenge, problem } : { step: "preview", problem };
      }
      if (state.step === "verifying") {
        // A used-up or expired code cannot be typed again: the resident asks for a new one from the same screen.
        return { step: "code", challenge: state.challenge, problem };
      }
      return state;
    }
  }
}

/** Seconds until `iso` (0 when past or unknown). */
export function secondsUntil(iso: string | null | undefined, now: number): number {
  if (!iso) return 0;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
}

/** Whether the six digits can be sent: a code step, no dead code (expired / exhausted). */
export function canVerify(state: RedeemState, digits: string): boolean {
  if (state.step !== "code" || !/^\d{6}$/.test(digits)) return false;
  return state.problem?.kind !== "codeExpired" && state.problem?.kind !== "tooManyAttempts";
}
