"use client";

/**
 * The pending SMS challenge of this tab (sessionStorage: gone when the tab closes, never sent anywhere). The SMS
 * link opens `/auth/otp`; the API's link carries no challenge id yet (CONTRACT-REQUEST #4), so the page finds it
 * here when the link is opened in the same browser, or in `?c=` when it is.
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
