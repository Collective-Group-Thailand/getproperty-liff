"use client";

/**
 * The pending SMS challenge of this tab (sessionStorage: gone when the tab closes, never sent anywhere). The SMS
 * link is `PUBLIC_RESIDENT_APP_URL/auth/otp?c=<challengeId>` (contract request #4, done): the page reads `?c=`,
 * and this tab's pending challenge when the link is opened in the same browser (it also carries the phone, so a
 * code can be resent).
 */
export interface PendingOtp {
  challengeId: string;
  /** E.164, to resend a code without asking again. */
  phone: string;
  resendAvailableAt: string;
  expiresAt: string;
}

const KEY = "gp_otp";

export function savePendingOtp(value: PendingOtp): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Without storage the `?c=` in the URL still carries the challenge.
  }
}

export function readPendingOtp(): PendingOtp | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingOtp) : null;
  } catch {
    return null;
  }
}

export function clearPendingOtp(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
