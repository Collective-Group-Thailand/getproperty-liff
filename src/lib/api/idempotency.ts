import { IDEMPOTENT_OPERATIONS } from "./operations.generated";

/**
 * Which calls need an `Idempotency-Key` (contract §3: irreversible POSTs — payments, signatures, notices, PDPA
 * requests). The list is generated from the contract (`IdempotencyKey` parameter), so a new flagged operation
 * gets a key without anyone remembering to add it. Contract-request endpoints add theirs here by hand.
 */
const EXTRA: readonly string[] = [];

const matchers = [...IDEMPOTENT_OPERATIONS, ...EXTRA].map((entry) => {
  const [method, template] = entry.split(" ") as [string, string];
  const pattern = template
    .split("/")
    .map((segment) => (/^\{[^}]+\}$/.test(segment) ? "[^/]+" : segment.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&")))
    .join("/");
  return { method, regex: new RegExp(`^${pattern}$`) };
});

/** True when `METHOD path` (a concrete path such as `/v1/resident/invoices/42/pay`) must carry a key. */
export function needsIdempotencyKey(method: string, path: string): boolean {
  const upper = method.toUpperCase();
  const bare = path.split("?")[0] ?? path;
  return matchers.some((m) => m.method === upper && m.regex.test(bare));
}

/** A fresh key per user action; a retry of the same action must reuse it (callers keep it in their mutation). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
