import type { TokenPairLike } from "./cookies";

/**
 * `POST /v1/auth/refresh` with single-flight (ADR-0006). Refresh tokens are single-use and **reusing a rotated
 * one revokes the whole sign-in** (D-163). A page render and its client fetches can easily present the same
 * refresh cookie at once, so concurrent refreshes of one token in this process share one call, and its result is
 * remembered for a short while so a request that arrives a moment later with the old cookie gets the new pair
 * instead of killing the session. (Several server instances can still race; the proxy refreshes before the
 * access token expires, which keeps that window small — noted in ADR-0006.)
 */
export type RefreshOutcome =
  { ok: true; pair: TokenPairLike & Record<string, unknown> } | { ok: false; status: number; code: string | undefined };

type Upstream = (request: Request) => Promise<Response>;

const REMEMBER_MS = 20_000;
/**
 * Process-wide on purpose (`globalThis`): Next bundles the proxy and the route handlers separately, and both
 * refresh — a module-level Map would let a page render and a BFF call rotate the same token twice.
 */
const holder = globalThis as typeof globalThis & {
  __gpRefreshInflight?: Map<string, { at: number; promise: Promise<RefreshOutcome> }>;
};
holder.__gpRefreshInflight ??= new Map();
const inflight = holder.__gpRefreshInflight;

async function fingerprint(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function callRefresh(
  apiBase: string,
  refreshToken: string,
  upstream: Upstream,
  headers: Record<string, string>,
): Promise<RefreshOutcome> {
  let response: Response;
  try {
    response = await upstream(
      new Request(`${apiBase}/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...headers },
        body: JSON.stringify({ refreshToken }),
      }),
    );
  } catch {
    return { ok: false, status: 502, code: "bff.upstream_unavailable" };
  }
  if (response.ok) {
    const pair = (await response.json()) as TokenPairLike & Record<string, unknown>;
    if (typeof pair.accessToken === "string" && typeof pair.refreshToken === "string") return { ok: true, pair };
    return { ok: false, status: 502, code: "bff.upstream_invalid" };
  }
  let code: string | undefined;
  try {
    code = ((await response.json()) as { code?: string }).code;
  } catch {
    code = undefined;
  }
  return { ok: false, status: response.status, code };
}

export async function refreshTokens(
  apiBase: string,
  refreshToken: string,
  upstream: Upstream,
  headers: Record<string, string> = {},
  now: () => number = Date.now,
): Promise<RefreshOutcome> {
  const key = await fingerprint(refreshToken);
  for (const [k, entry] of inflight) if (now() - entry.at > REMEMBER_MS) inflight.delete(k);
  const existing = inflight.get(key);
  if (existing) return existing.promise;
  const promise = callRefresh(apiBase, refreshToken, upstream, headers);
  inflight.set(key, { at: now(), promise });
  const outcome = await promise;
  // A transient failure must not be remembered: the next request may try again with the same token.
  if (!outcome.ok && (outcome.status >= 500 || outcome.status === 429)) inflight.delete(key);
  return outcome;
}

/** A refresh failure that means the sign-in is over (as opposed to the API being briefly unavailable). */
export function refreshRejected(outcome: RefreshOutcome): boolean {
  return !outcome.ok && outcome.status >= 400 && outcome.status < 500 && outcome.status !== 429;
}

export function resetRefreshCacheForTesting(): void {
  inflight.clear();
}
