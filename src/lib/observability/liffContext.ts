/**
 * The LIFF context RUM and error reports may carry (L1 1.3 §5): whether the page runs inside the LINE app and
 * the OS LIFF reports. Never the id token, the LINE user id or the profile. Kept in sessionStorage by the LIFF
 * entry so later pages of the same visit can read it without touching the SDK.
 */
export interface LiffContext {
  inClient: boolean;
  os: string;
}

const KEY = "gp_liff_ctx";

export function rememberLiffContext(context: LiffContext): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ inClient: context.inClient, os: context.os }));
  } catch {
    // Storage can be unavailable (private mode, quota); the context is only a nice-to-have.
  }
}

export function readLiffContext(): LiffContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LiffContext>;
    return typeof parsed.inClient === "boolean" && typeof parsed.os === "string"
      ? { inClient: parsed.inClient, os: parsed.os }
      : null;
  } catch {
    return null;
  }
}
