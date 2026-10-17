import { LIFF_STATE_PARAM, safeInternalPath } from "@/lib/liff/deepLink";

/**
 * Where a signed-out visitor goes. Inside LINE's in-app browser the LIFF endpoint signs them in silently
 * (`/liff?liff.state=<next>`); anywhere else they get the sign-in page — "open in LINE" or an SMS link
 * (D-060). `next` always passes through `safeInternalPath`, so no redirect ever leaves the app.
 */
export function isLineInAppBrowser(userAgent: string | null | undefined): boolean {
  return / Line\/\d/i.test(userAgent ?? "");
}

export function signInPath(next: string, userAgent: string | null | undefined): string {
  const target = safeInternalPath(next);
  if (isLineInAppBrowser(userAgent)) return `/liff?${LIFF_STATE_PARAM}=${encodeURIComponent(target)}`;
  return target === "/" ? "/auth" : `/auth?next=${encodeURIComponent(target)}`;
}

export function consentPath(next: string): string {
  const target = safeInternalPath(next);
  return target === "/" ? "/consent" : `/consent?next=${encodeURIComponent(target)}`;
}

/** The request path the proxy recorded (`x-gp-pathname`), for guards in layouts that cannot see the URL. */
export const PATHNAME_HEADER = "x-gp-pathname";
