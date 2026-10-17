import type { LiffClient } from "./types";

/**
 * The one place that loads a LIFF implementation. `NEXT_PUBLIC_LIFF_MOCK` is inlined at build time,
 * and the comparison is written inline (not behind a helper) so the bundler drops the branch it does
 * not take: a production build never contains the fake (`release-hygiene` checks), and a mock build
 * never downloads the SDK.
 */
let client: Promise<LiffClient> | null = null;

export function getLiff(): Promise<LiffClient> {
  client ??=
    process.env.NEXT_PUBLIC_LIFF_MOCK === "1"
      ? import("./fake").then(({ createBrowserFakeLiff, createFakeLiff }) =>
          typeof document === "undefined" ? createFakeLiff() : createBrowserFakeLiff(),
        )
      : import("@line/liff").then(({ default: liff }) => fromSdk(liff));
  return client;
}

/** Tests (and Storybook, later) inject a fake directly. */
export function setLiffForTesting(fake: LiffClient | null): void {
  client = fake ? Promise.resolve(fake) : null;
}

export function isLiffMocked(): boolean {
  return process.env.NEXT_PUBLIC_LIFF_MOCK === "1";
}

/** The LIFF app id from the LINE Developers console; a fixed stand-in when mocked. */
export function liffId(): string | undefined {
  return process.env.NEXT_PUBLIC_LIFF_MOCK === "1" ? "0000000000-mock" : process.env.NEXT_PUBLIC_LIFF_ID || undefined;
}

/**
 * Opens a URL the LIFF way (CLAUDE.md: never `window.open` inside LINE). `external: true` leaves
 * LINE for the system browser — banking apps, PDFs the in-app viewer cannot show.
 */
export async function openExternal(url: string, { external = true }: { external?: boolean } = {}): Promise<void> {
  const liff = await getLiff();
  liff.openWindow({ url, external });
}

type Sdk = (typeof import("@line/liff"))["default"];

function fromSdk(liff: Sdk): LiffClient {
  return {
    init: (config) => liff.init(config),
    isLoggedIn: () => liff.isLoggedIn(),
    login: (options) => liff.login(options),
    logout: () => liff.logout(),
    getIDToken: () => liff.getIDToken(),
    isInClient: () => liff.isInClient(),
    getLanguage: () => liff.getLanguage(),
    getOS: () => liff.getOS(),
    openWindow: (params) => liff.openWindow(params),
    closeWindow: () => liff.closeWindow(),
  };
}
