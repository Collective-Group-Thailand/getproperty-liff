import { useState } from "react";

import { isApiError } from "./problem";

/** What one logical action sends: its `Idempotency-Key` and the body frozen with it. */
export interface FrozenAttempt<B> {
  readonly key: string;
  readonly body: B;
}

/** Canonical JSON (sorted keys): the same intent always compares equal. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value ?? null));
}

/**
 * One `Idempotency-Key` per **logical action**, with the body frozen for its retries (review M2). The API fingerprints
 * the body: the same key with a different body is `422 idempotency.key_reused`, so a retry after a lost answer must
 * send exactly the first body — not one rebuilt with a new `Date.now()` or freshly uploaded photo ids.
 *
 * `prepare(intent, build)`: while the resident's intent (what they chose: name and hours, reason and photos …) is the
 * one of the pending attempt, the same key and body come back; another intent starts a new attempt (`build` runs
 * once per attempt). `succeeded()` ends the action; `failed(error)` keeps it for a retry, except after
 * `idempotency.key_reused`. `maxAgeMs` lets a body with a time window expire (a visitor code from "now").
 */
export class IdempotentAttempt<B> {
  private pending: { key: string; intent: string; body: B; at: number } | null = null;

  constructor(private readonly options: { maxAgeMs?: number; now?: () => number; newKey?: () => string } = {}) {}

  async prepare(intent: unknown, build: () => B | Promise<B>): Promise<FrozenAttempt<B>> {
    const now = this.options.now ?? Date.now;
    const fingerprint = canonical(intent);
    const fresh =
      this.pending &&
      this.pending.intent === fingerprint &&
      (this.options.maxAgeMs === undefined || now() - this.pending.at <= this.options.maxAgeMs);
    if (fresh && this.pending) return { key: this.pending.key, body: this.pending.body };
    const body = await build();
    // `crypto.randomUUID()` like `newIdempotencyKey` — not imported, so this module stays out of the shell's chunks.
    this.pending = {
      key: (this.options.newKey ?? (() => crypto.randomUUID()))(),
      intent: fingerprint,
      body,
      at: now(),
    };
    return { key: this.pending.key, body };
  }

  succeeded(): void {
    this.pending = null;
  }

  failed(error: unknown): void {
    if (isApiError(error) && error.code === "idempotency.key_reused") this.pending = null;
  }

  /** The key of the pending attempt, if any (tests, diagnostics). */
  get key(): string | undefined {
    return this.pending?.key;
  }
}

/** `IdempotentAttempt` kept for the component's lifetime. */
export function useIdempotentAttempt<B>(options?: { maxAgeMs?: number }): IdempotentAttempt<B> {
  const [attempt] = useState(() => new IdempotentAttempt<B>(options));
  return attempt;
}
