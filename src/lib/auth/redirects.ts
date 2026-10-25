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

/** Where a signed-out technician goes: LINE sign-in as a technician inside LINE, the technician sign-in page elsewhere. */
export function technicianSignInPath(next: string, userAgent: string | null | undefined): string {
  const safe = safeInternalPath(next);
  const target = safe.startsWith("/technician") ? safe : "/technician";
  if (isLineInAppBrowser(userAgent)) return `/liff?${LIFF_STATE_PARAM}=${encodeURIComponent(target)}`;
  return `/technician/sign-in?next=${encodeURIComponent(target)}`;
}

/**
 * Where a signed-out prospect goes (L5, D-281): LINE sign-in as a prospect inside LINE, the prospect sign-in page
 * elsewhere ("open in LINE"; phone, Google and Apple follow with D-255's OAuth clients).
 */
export function prospectSignInPath(next: string, userAgent: string | null | undefined): string {
  const safe = safeInternalPath(next);
  const target = safe.startsWith("/rent") ? safe : "/rent/enquiries";
  if (isLineInAppBrowser(userAgent)) return `/liff?${LIFF_STATE_PARAM}=${encodeURIComponent(target)}`;
  return `/rent/sign-in?next=${encodeURIComponent(target)}`;
}

/**
 * Where a signed-out landlord goes (L5 5.3, D-251): LINE sign-in with the landlord's operator session inside LINE;
 * elsewhere a page that says to open it in LINE (the full console is getproperty-web).
 */
export function landlordSignInPath(next: string, userAgent: string | null | undefined): string {
  const safe = safeInternalPath(next);
  const target = safe.startsWith("/landlord") ? safe : "/landlord";
  if (isLineInAppBrowser(userAgent)) return `/liff?${LIFF_STATE_PARAM}=${encodeURIComponent(target)}`;
  return `/landlord/sign-in?next=${encodeURIComponent(target)}`;
}

export function consentPath(next: string): string {
  const target = safeInternalPath(next);
  return target === "/" ? "/consent" : `/consent?next=${encodeURIComponent(target)}`;
}

/** The request path the proxy recorded (`x-gp-pathname`), for guards in layouts that cannot see the URL. */
export const PATHNAME_HEADER = "x-gp-pathname";
