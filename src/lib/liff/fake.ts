import type { LiffClient } from "./types";

/**
 * An in-memory LIFF for unit tests, Playwright and `pnpm dev:mock` (`NEXT_PUBLIC_LIFF_MOCK=1`). It
 * behaves like the SDK inside the LINE app by default (logged in, in client) and records every call so
 * tests can assert on them. `release-hygiene` fails a production build that contains the marker below.
 */
export const FAKE_LIFF_MARKER = "__GP_FAKE_LIFF__";

export interface FakeLiffOptions {
  loggedIn?: boolean;
  inClient?: boolean;
  language?: string;
  os?: "ios" | "android" | "web";
  idToken?: string | null;
  /** Make `init` reject, to exercise the error path. */
  failInit?: string;
}

export interface FakeLiff extends LiffClient {
  readonly marker: typeof FAKE_LIFF_MARKER;
  readonly calls: string[];
  readonly opened: { url: string; external?: boolean }[];
  readonly initialised: boolean;
}

export function createFakeLiff(options: FakeLiffOptions = {}): FakeLiff {
  let loggedIn = options.loggedIn ?? true;
  let initialised = false;
  const calls: string[] = [];
  const opened: { url: string; external?: boolean }[] = [];
  const idToken = options.idToken === undefined ? "fake.id.token" : options.idToken;

  const guard = (method: string) => {
    calls.push(method);
    if (!initialised && method !== "init") throw new Error(`liff.${method}() called before liff.init()`);
  };

  return {
    marker: FAKE_LIFF_MARKER,
    calls,
    opened,
    get initialised() {
      return initialised;
    },
    async init({ liffId }) {
      calls.push("init");
      if (options.failInit) throw new Error(options.failInit);
      if (!liffId) throw new Error("liffId is required");
      initialised = true;
    },
    isLoggedIn() {
      guard("isLoggedIn");
      return loggedIn;
    },
    login() {
      guard("login");
      // The real SDK navigates to LINE Login and comes back logged in; the fake just flips the flag.
      loggedIn = true;
    },
    logout() {
      guard("logout");
      loggedIn = false;
    },
    getIDToken() {
      guard("getIDToken");
      return loggedIn ? idToken : null;
    },
    isInClient() {
      guard("isInClient");
      return options.inClient ?? true;
    },
    getLanguage() {
      calls.push("getLanguage");
      return options.language ?? "th";
    },
    getOS() {
      calls.push("getOS");
      return options.os ?? "android";
    },
    openWindow(params) {
      guard("openWindow");
      opened.push(params);
    },
    closeWindow() {
      guard("closeWindow");
    },
  };
}
