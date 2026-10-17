import { resolveLiffState } from "./deepLink";
import type { LiffAudience, LiffClient, LiffEntryResult, LiffExchange, LiffStepName, LiffStepState } from "./types";

export interface LiffEntryOptions {
  liffId: string | undefined;
  /** `window.location.search` of the LIFF endpoint, carrying `liff.state`. */
  search: string;
  /** Where LINE Login returns to outside the LINE app. */
  redirectUri?: string;
  /** `POST /bff/auth/line` (or the technician one): id token → httpOnly session cookies. */
  exchange: LiffExchange;
  /** Technician screens exist (`FEATURE_TECHNICIAN=1`); otherwise every sign-in is a resident one. */
  technicianEnabled?: boolean;
  onStep?: (step: LiffStepName, state: LiffStepState) => void;
}

/** A deep link into the technician screens signs in as a technician (R2); everything else as a resident. */
export function audienceFor(target: string, technicianEnabled: boolean): LiffAudience {
  return technicianEnabled && /^\/technician(\/|\?|#|$)/.test(target) ? "technician" : "resident";
}

/**
 * The LIFF entry sequence (master plan §3, ADR-0006): `liff.init` → login if needed (outside LINE this
 * navigates to LINE Login and comes back here) → `liff.getIDToken()` → exchange through the BFF →
 * the `liff.state` target. The id token exists only inside this function, between reading it from the SDK and
 * handing it to `exchange`; it is not in the result, the step callbacks or any log.
 */
export async function runLiffEntry(liff: LiffClient, options: LiffEntryOptions): Promise<LiffEntryResult> {
  const step = options.onStep ?? (() => undefined);

  step("init", "running");
  if (!options.liffId) {
    step("init", "failed");
    return { status: "error", step: "init", message: "NEXT_PUBLIC_LIFF_ID is not set" };
  }
  try {
    await liff.init({ liffId: options.liffId });
  } catch (error) {
    step("init", "failed");
    return { status: "error", step: "init", message: error instanceof Error ? error.message : String(error) };
  }
  step("init", "done");

  step("login", "running");
  if (!liff.isLoggedIn()) {
    liff.login(options.redirectUri ? { redirectUri: options.redirectUri } : undefined);
    // The real SDK has navigated away by now; only the fake returns logged in.
    if (!liff.isLoggedIn()) return { status: "redirecting" };
  }
  if (liff.getIDToken() === null) {
    step("login", "failed");
    return { status: "error", step: "login", message: "LINE returned no id token (is the openid scope enabled?)" };
  }
  step("login", "done");

  const target = resolveLiffState(options.search);
  const audience = audienceFor(target, options.technicianEnabled ?? false);

  step("session", "running");
  const exchanged = await options.exchange(liff.getIDToken() ?? "", audience);
  if (!exchanged.ok) {
    step("session", "failed");
    return {
      status: "error",
      step: "session",
      message: exchanged.message,
      code: exchanged.code,
      ...(exchanged.requestId ? { requestId: exchanged.requestId } : {}),
    };
  }
  step("session", "done");

  step("link", "running");
  step("link", "done");
  return { status: "ready", target, inClient: liff.isInClient(), audience };
}
