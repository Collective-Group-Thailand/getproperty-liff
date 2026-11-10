import type { ApiError } from "./problem";

/**
 * A final 4xx answer that refuses the action (validation, not allowed, `idempotency.key_reused` …): the same intent
 * sent again is a **new** action with a new `Idempotency-Key` (reviews L1–L3). Not a refusal: a lost answer (status 0),
 * a 5xx, `408`, `429` and `idempotency.in_progress` — the answer may still come, so the key is kept for the retry.
 */
export function isRefusal(error: ApiError): boolean {
  const { status } = error;
  if (status < 400 || status >= 500 || status === 408 || status === 429) return false;
  return error.code !== "idempotency.in_progress";
}
