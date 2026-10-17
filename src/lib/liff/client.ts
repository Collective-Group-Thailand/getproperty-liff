import type { LiffClient, LiffTextMessage } from "./types";

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
  try {
    const liff = await getLiff();
    try {
      liff.openWindow({ url, external });
    } catch {
      // Pages other than the LIFF entry may not have initialised the SDK yet (a reload of /lease, a link from SMS).
      const id = liffId();
      if (!id) throw new Error("no LIFF id");
      await liff.init({ liffId: id });
      liff.openWindow({ url, external });
    }
  } catch {
    // Outside LINE without a usable SDK: a plain navigation (never `window.open`, CLAUDE.md).
    window.location.assign(url);
  }
}

/** Initialises the SDK when a page other than the LIFF entry needs it (a reload of /receipts, a link from SMS). */
async function ready(): Promise<LiffClient> {
  const liff = await getLiff();
  try {
    liff.isInClient();
  } catch {
    const id = liffId();
    if (!id) throw new Error("no LIFF id");
    await liff.init({ liffId: id });
  }
  return liff;
}

/**
 * Shares a message to a LINE chat through `liff.shareTargetPicker` (the resident picks friends or groups) —
 * `"unavailable"` outside LINE, on old LINE versions or when the channel has the picker off; the caller then
 * offers the system share sheet or a copy instead.
 */
export async function shareToLine(messages: LiffTextMessage[]): Promise<"sent" | "cancelled" | "unavailable"> {
  try {
    const liff = await ready();
    if (!liff.isInClient() || !liff.isApiAvailable("shareTargetPicker")) return "unavailable";
    return (await liff.shareTargetPicker(messages)) ? "sent" : "cancelled";
  } catch {
    return "unavailable";
  }
}

/** True inside the LINE app (false outside it, or when the SDK cannot start). */
export async function inLineClient(): Promise<boolean> {
  try {
    return (await ready()).isInClient();
  } catch {
    return false;
  }
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
    isApiAvailable: (api) => liff.isApiAvailable(api),
    // `shareTargetPicker` resolves `undefined` when the resident closed the picker (SDK ≥ 2.x).
    shareTargetPicker: async (messages) => Boolean(await liff.shareTargetPicker(messages, { isMultiple: true })),
  };
}
