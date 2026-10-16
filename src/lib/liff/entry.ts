import { resolveLiffState } from "./deepLink";
import type { LiffClient, LiffEntryResult, LiffStepName, LiffStepState } from "./types";

export interface LiffEntryOptions {
  liffId: string | undefined;
  /** `window.location.search` of the LIFF endpoint, carrying `liff.state`. */
  search: string;
  /** Where LINE Login returns to outside the LINE app. */
  redirectUri?: string;
  onStep?: (step: LiffStepName, state: LiffStepState) => void;
}

/**
 * The LIFF entry sequence (L0 placeholder of L1's flow): init → login → resolve the `liff.state`
 * deep link. L1 inserts the id-token exchange through the BFF (`POST /bff/auth/line` →
 * `/v1/auth/resident/line` → httpOnly cookies) between login and link; until then the token is only
 * checked for presence and never read into anything that outlives this call.
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

  step("link", "running");
  const target = resolveLiffState(options.search);
  step("link", "done");
  return { status: "ready", target, inClient: liff.isInClient() };
}
