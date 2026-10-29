import { safeNext } from "./model";

/**
 * Where to go back after the e-KYC provider (review G, L5): the API sends every prospect back to its fixed page
 * (`/rent/verification`, no query), so the booking that sent them there is kept in this tab's `sessionStorage` while
 * they are at the provider — a path only, checked with `safeNext` on the way in and on the way out (no open
 * redirect), and forgotten after an hour (a provider session is far shorter).
 */
const KEY = "gp.verification.return";
const TTL_MS = 60 * 60_000;

export function rememberReturn(path: string | null | undefined, now = Date.now()): void {
  const safe = safeNext(path ?? undefined);
  if (!safe) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path: safe, at: now }));
  } catch {
    // Storage blocked (private mode): the page falls back to its usual back link.
  }
}

export function recallReturn(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof value.at !== "number" || now - value.at > TTL_MS || now < value.at) return null;
    return safeNext(typeof value.path === "string" ? value.path : undefined);
  } catch {
    return null;
  }
}
