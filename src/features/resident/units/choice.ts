import { UNIT_COOKIE } from "@/lib/auth/cookies";

/**
 * The unit the resident last chose (JRL): the `gp_unit` cookie is what the server renders with; a copy in
 * `localStorage` puts it back when LINE's in-app browser lost the cookie. Storage can throw (private mode, a full
 * quota, a blocked WebView) — then only the cookie remembers it. Never a token or personal data: a unit id.
 */
export const UNIT_STORAGE_KEY = "gp.unit";

const ONE_YEAR = 31_536_000;

export function writeUnitCookie(unitId: string, doc: Pick<Document, "cookie"> = document, secure = isHttps()): void {
  doc.cookie = `${UNIT_COOKIE}=${encodeURIComponent(unitId)}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure ? "; secure" : ""}`;
}

function isHttps(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Cookie and storage; the storage half fails quietly. */
export function rememberUnit(unitId: string, doc: Pick<Document, "cookie"> = document, store = storage()): void {
  writeUnitCookie(unitId, doc);
  try {
    store?.setItem(UNIT_STORAGE_KEY, unitId);
  } catch {
    // storage unavailable: the cookie alone remembers the choice
  }
}

export function recallUnit(store = storage()): string | null {
  try {
    return store?.getItem(UNIT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * The unit to restore after a render without the cookie: the stored one when it is still one of mine and is not the
 * one already shown; otherwise nothing to do.
 */
export function unitToRestore(stored: string | null, unitIds: readonly string[], shown: string): string | null {
  if (!stored || stored === shown || !unitIds.includes(stored)) return null;
  return stored;
}
