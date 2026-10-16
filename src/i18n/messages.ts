import { FALLBACK_LOCALE, type Locale } from "./routing";

/**
 * Messages are `messages/<locale>/<namespace>.json`. `shared` and `resident` are always loaded;
 * `technician` only for the technician screens (R2), so a resident's bundle never carries them.
 *
 * Fallback (D-064): every locale is merged over English, key by key, so a missing my/km/lo/zh string
 * renders in English rather than as a key. Thai and English must be complete (`messages.test.ts`).
 */
export type Namespace = "shared" | "resident" | "technician";
type Messages = Record<string, unknown>;

async function load(locale: Locale, namespace: Namespace): Promise<Messages> {
  return (await import(`./messages/${locale}/${namespace}.json`)).default as Messages;
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
      const own = await load(locale, namespace);
      return locale === FALLBACK_LOCALE ? own : mergeMessages(await load(FALLBACK_LOCALE, namespace), own);
    }),
  );
  return parts.reduce<Messages>((all, part) => mergeMessages(all, part), {});
}
