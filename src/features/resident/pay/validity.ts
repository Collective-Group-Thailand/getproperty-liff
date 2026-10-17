/**
 * How long the API's Thai QR stays valid (`ResidentQrDto.expiresAt`; the API re-creates an expired QR on the next
 * `GET …/payment`, D-197). Far away → the date; within the last hour → a ticking countdown; the last
 * {@link COUNTDOWN_BAR_SECONDS} also as a bar; past → expired. Time only — no money here.
 */
export type QrValidity =
  | { kind: "open" }
  | { kind: "until"; expiresAt: string }
  | { kind: "countdown"; seconds: number }
  | { kind: "expired" };

/** Below this the remaining time ticks by the second. */
export const COUNTDOWN_SECONDS = 60 * 60;
/** Below this the countdown also shows as a bar (`Progress`). */
export const COUNTDOWN_BAR_SECONDS = 15 * 60;

export function qrValidity(expiresAt: string | null, now: number): QrValidity {
  if (!expiresAt) return { kind: "open" };
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return { kind: "open" };
  const seconds = Math.ceil((end - now) / 1000);
  if (seconds <= 0) return { kind: "expired" };
  if (seconds <= COUNTDOWN_SECONDS) return { kind: "countdown", seconds };
  return { kind: "until", expiresAt };
}

/** `14:05` (minutes:seconds) — the countdown never exceeds an hour. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
