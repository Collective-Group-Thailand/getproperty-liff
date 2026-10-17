import { fakeLineIdToken } from "./fakeLineToken";
import type { LiffClient } from "./types";

/**
 * An in-memory LIFF for unit tests, Playwright and `pnpm dev:mock` (`NEXT_PUBLIC_LIFF_MOCK=1`). It
 * behaves like the SDK inside the LINE app by default (logged in, in client) and records every call so
 * tests can assert on them. `release-hygiene` fails a production build that contains the marker below.
 */
export const FAKE_LIFF_MARKER = "__GP_FAKE_LIFF__";

/** The default fake LINE user: a resident with one unit and every required consent given. */
export const DEFAULT_FAKE_SUB = "U0000000000000000000000mockresident";

/**
 * Mock builds read the fake's options from this JS-readable cookie (JSON), so e2e tests can play a resident
 * outside LINE, a newcomer, a technician… (`e2e/support.ts`). Ignored in production builds, which never
 * contain the fake.
 */
export const FAKE_LIFF_COOKIE = "gp_fake_liff";

/** Browser fake for mock builds: options from the cookie, LINE Login simulated as a navigation. */
export function createBrowserFakeLiff(): FakeLiff {
  const options = fakeOptionsFromCookie(document.cookie);
  return createFakeLiff({
    ...options,
    redirect: (redirectUri) => {
      const next = encodeURIComponent(JSON.stringify({ ...options, loggedIn: true }));
      document.cookie = `${FAKE_LIFF_COOKIE}=${next}; path=/; samesite=lax`;
      window.location.assign(redirectUri ?? window.location.href);
    },
  });
}

export function fakeOptionsFromCookie(cookie: string): FakeLiffOptions {
  const raw = cookie.match(new RegExp(`(?:^|; )${FAKE_LIFF_COOKIE}=([^;]*)`))?.[1];
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    return parsed && typeof parsed === "object" ? (parsed as FakeLiffOptions) : {};
  } catch {
    return {};
  }
}

export interface FakeLiffOptions {
  loggedIn?: boolean;
  inClient?: boolean;
  language?: string;
  os?: "ios" | "android" | "web";
  /** LINE user id inside the fake id token; scenario words pick the mock account (`mocks/state.ts`). */
  sub?: string;
  name?: string;
  /** Overrides the id token entirely (`null` = LINE returned none). */
  idToken?: string | null;
  /** Make `init` reject, to exercise the error path. */
  failInit?: string;
  /**
   * Simulates LINE Login's round trip outside LINE: instead of flipping to logged in, hand over to this (the
   * browser fake navigates to the redirect URI as LINE Login would). Unset in unit tests.
   */
  redirect?: (redirectUri: string | undefined) => void;
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
  const idToken =
    options.idToken === undefined
      ? fakeLineIdToken({ sub: options.sub ?? DEFAULT_FAKE_SUB, name: options.name ?? "สมชาย ใจดี" })
      : options.idToken;

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
    login(params) {
      guard("login");
      // The real SDK navigates to LINE Login and comes back logged in.
      if (options.redirect) options.redirect(params?.redirectUri);
      else loggedIn = true;
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
