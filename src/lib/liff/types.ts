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
}

export type LiffStepName = "init" | "login" | "link";
export type LiffStepState = "pending" | "running" | "done" | "failed";

export type LiffEntryResult =
  | { status: "ready"; target: string; inClient: boolean }
  | { status: "redirecting" }
  | { status: "error"; step: LiffStepName; message: string };
