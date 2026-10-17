/**
 * The slice of the LIFF SDK this app uses, as an interface so the real SDK (`@line/liff`) and the
 * in-memory fake (`fake.ts`) are interchangeable. Add a method here before using it anywhere.
 */
export interface LiffClient {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  /** Redirects to LINE Login outside the LINE app; inside LINE the user is always logged in. */
  login(options?: { redirectUri?: string }): void;
  logout(): void;
  /**
   * The LINE id token. It is read only to be exchanged once through this app's BFF for httpOnly
   * session cookies (L1) — never stored, logged or sent anywhere else (CLAUDE.md).
   */
  getIDToken(): string | null;
  isInClient(): boolean;
  /** BCP-47 language of the LINE app, e.g. `th`, `en-US`, `zh-TW`. */
  getLanguage(): string;
  getOS(): "ios" | "android" | "web" | undefined;
  /** The only way to open a URL from inside LINE (no `window.open`, CLAUDE.md). */
  openWindow(params: { url: string; external?: boolean }): void;
  closeWindow(): void;
  /** Whether an SDK API works in this environment (`shareTargetPicker` needs LINE 10.3+ and the channel setting). */
  isApiAvailable(api: "shareTargetPicker"): boolean;
  /**
   * LINE's share target picker (friends and groups). Resolves `true` when sent, `false` when the resident
   * closed the picker; rejects when the SDK refused.
   */
  shareTargetPicker(messages: LiffTextMessage[]): Promise<boolean>;
}

/** The one LINE message type this app shares (a receipt summary with a link back into the app). */
export interface LiffTextMessage {
  type: "text";
  text: string;
}

export type LiffStepName = "init" | "login" | "session" | "link";
export type LiffStepState = "pending" | "running" | "done" | "failed";

export type LiffAudience = "resident" | "technician";

/**
 * The outcome of the entry sequence. It never contains the LINE id token (`liff.test.ts` asserts it): the
 * token is read, handed to `exchange` and dropped.
 */
export type LiffEntryResult =
  | { status: "ready"; target: string; inClient: boolean; audience: LiffAudience }
  | { status: "redirecting" }
  | {
      status: "error";
      step: LiffStepName;
      message: string;
      /** The API's problem code when the exchange was refused (`auth.line_token_invalid` …). */
      code?: string;
      requestId?: string;
    };

/** Exchanges the id token through the BFF for session cookies; never keeps the token. */
export type LiffExchange = (
  idToken: string,
  audience: LiffAudience,
) => Promise<{ ok: true } | { ok: false; code: string; message: string; requestId?: string }>;
