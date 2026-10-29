import { FALLBACK_LOCALE, type Locale } from "./routing";

/**
 * Messages per feature (L1): `messages/<locale>/<namespace>/<feature>.json`.
 *
 * - `shared/<feature>.json` is mounted at the root (`shell.*`, `common.*`, `errors.*`, `status.*` …);
 * - `resident/<feature>.json` under `resident.<feature>`; `technician/<feature>.json` under `technician.<feature>`;
 *   `prospect/<feature>.json` under `prospect.<feature>` (L5).
 *
 * `shared` and `resident` are always loaded; `technician` only where the technician screens are (R2), so a
 * resident's messages never carry them. `MESSAGE_FILES` is the manifest (`messages.test.ts` checks it against
 * the folders): add a file there when a feature gets one.
 *
 * Fallback (D-064): every locale is merged over English, key by key, so a missing my/km/lo/zh string renders in
 * English rather than as a key. Thai and English must be complete (`messages.test.ts`).
 */
export type Namespace = "shared" | "resident" | "technician" | "prospect" | "landlord";
type Messages = Record<string, unknown>;

export const MESSAGE_FILES = {
  shared: ["brand", "common", "errors", "recommendations", "rentRecord", "shell", "status", "verification"],
  resident: [
    "auth",
    "consent",
    "contracts",
    "deposit",
    "home",
    "invoices",
    "lease",
    "liff",
    "link",
    "nav",
    "pay",
    "profile",
    "receipts",
    "relocation",
    "requests",
    "reviews",
    "community",
    "access",
    "usage",
  ],
  technician: ["auth", "workOrders"],
  /**
   * L5 (D-252): people asking about a listing — `rent` Thai and English first (the other languages fall back to
   * English); `selfViewing` (GL2, D-295) complete in all six languages.
   */
  prospect: ["rent", "selfViewing"],
  /** L5 5.3 (D-251): a landlord's quick actions — Thai and English; the other languages fall back to English. */
  landlord: ["home"],
} as const satisfies Record<Namespace, readonly string[]>;

async function loadFile(locale: Locale, namespace: Namespace, feature: string): Promise<Messages> {
  return (await import(`./messages/${locale}/${namespace}/${feature}.json`)).default as Messages;
}

async function loadNamespace(locale: Locale, namespace: Namespace): Promise<Messages> {
  const files = MESSAGE_FILES[namespace];
  const parts = await Promise.all(files.map((feature) => loadFile(locale, namespace, feature)));
  const mounted: Messages = {};
  files.forEach((feature, index) => {
    mounted[feature] = parts[index];
  });
  return namespace === "shared" ? mounted : { [namespace]: mounted };
}

/** Deep merge: `over` wins key by key; nested objects merge, everything else replaces. */
export function mergeMessages(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    out[key] = isObject(current) && isObject(value) ? mergeMessages(current as Messages, value as Messages) : value;
  }
  return out;
}

function isObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadMessages(
  locale: Locale,
  namespaces: readonly Namespace[] = ["shared", "resident"],
): Promise<Messages> {
  const parts = await Promise.all(
    namespaces.map(async (namespace) => {
      const own = await loadNamespace(locale, namespace);
      return locale === FALLBACK_LOCALE ? own : mergeMessages(await loadNamespace(FALLBACK_LOCALE, namespace), own);
    }),
  );
  return parts.reduce<Messages>((all, part) => mergeMessages(all, part), {});
}
