/**
 * A fresh `Idempotency-Key` per user action; a retry of the same action must reuse it (callers keep it in their
 * mutation). Its own module, so a form that only needs a key does not pull `idempotency.ts`'s generated operation
 * list into its page's initial JS (D-179).
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
