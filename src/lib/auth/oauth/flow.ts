import "server-only";

import { cookies } from "next/headers";

import { serverApi } from "@/lib/api/server";
import { SESSION_COOKIE_FLAGS, sessionCookies } from "@/lib/auth/cookies";
import { oauthMode, serverEnv } from "@/lib/env";
import { safeInternalPath } from "@/lib/liff/deepLink";

import {
  ATTEMPT_COOKIE,
  ATTEMPT_MAX_AGE,
  attemptCookieOptions,
  decodeAttempt,
  encodeAttempt,
  sameState,
  type OAuthAttempt,
  type OAuthIntent,
} from "./attempt";
import {
  authorizeUrl,
  enabledProviders,
  exchangeCode,
  newAttempt,
  OAuthExchangeError,
  type OAuthEnv,
  type OAuthProvider,
} from "./providers";

/**
 * Google and Apple outside LINE (D-255, D-283) for prospects (`/rent/*`) and residents: the same server-side redirect
 * as getproperty-web's owner console, ending in `/v1/auth/{prospect|resident}/identity` and that audience's session
 * cookies. LINE itself is the LIFF (inside LINE) or "open in LINE".
 */

export function oauthEnv(): OAuthEnv {
  const env = serverEnv();
  return { ...env, OAUTH_MODE: oauthMode(env) };
}

/** Google and Apple, as configured (or both with the fake provider). */
export function oauthProviders(): ("google" | "apple")[] {
  return enabledProviders(oauthEnv()).filter((p): p is "google" | "apple" => p !== "line");
}

/** The public origin redirect URIs are registered with: `APP_ORIGIN`, else the request's own. */
export function publicOrigin(request: Request): string {
  return serverEnv().APP_ORIGIN ?? new URL(request.url).origin;
}

const callbackUri = (origin: string, provider: OAuthProvider) => `${origin}/bff/oauth/${provider}/callback`;

const defaultNext = (intent: OAuthIntent) => (intent === "prospect" ? "/rent/enquiries" : "/");

/** Where a refusal is shown: the sign-in page of the audience, with `?oauthError=<code>` and the original `next`. */
export function failureUrl(origin: string, intent: OAuthIntent, code: string, next?: string): string {
  const url = new URL(intent === "prospect" ? "/rent/sign-in" : "/auth", origin);
  url.searchParams.set("oauthError", code);
  if (next && next !== defaultNext(intent)) url.searchParams.set("next", next);
  return url.toString();
}

function nextFor(intent: OAuthIntent, raw: string | undefined): string {
  const path = safeInternalPath(raw ?? defaultNext(intent));
  if (intent === "prospect") return path.startsWith("/rent") ? path : "/rent/enquiries";
  return path.startsWith("/rent") || path.startsWith("/technician") ? "/" : path;
}

export async function startAttempt(
  origin: string,
  input: { provider: OAuthProvider; intent: OAuthIntent; locale: string; next?: string },
): Promise<string> {
  const next = nextFor(input.intent, input.next);
  if (!oauthProviders().includes(input.provider as "google"))
    return failureUrl(origin, input.intent, "oauth.unavailable", next);
  const values = newAttempt();
  const attempt: OAuthAttempt = {
    ...values,
    provider: input.provider,
    intent: input.intent,
    locale: input.locale,
    next,
  };
  (await cookies()).set(ATTEMPT_COOKIE, encodeAttempt(attempt), attemptCookieOptions(ATTEMPT_MAX_AGE));
  return authorizeUrl(oauthEnv(), input.provider, values, callbackUri(origin, input.provider), `${origin}/oauth/fake`);
}

export interface CallbackInput {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  user?: string | null;
}

function appleName(user: string | null | undefined): string | undefined {
  if (!user) return undefined;
  try {
    const parsed = JSON.parse(user) as { name?: { firstName?: string; lastName?: string } };
    return [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ").trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Callback: check the attempt, exchange the code, sign in with the API, set the session cookies, say where to go. */
export async function finishAttempt(origin: string, provider: OAuthProvider, input: CallbackInput): Promise<string> {
  const jar = await cookies();
  const attempt = decodeAttempt(jar.get(ATTEMPT_COOKIE)?.value);
  jar.set(ATTEMPT_COOKIE, "", attemptCookieOptions(0));
  if (!attempt) return failureUrl(origin, "prospect", "oauth.expired");
  const next = nextFor(attempt.intent, attempt.next);
  if (attempt.provider !== provider || !sameState(attempt.state, input.state))
    return failureUrl(origin, attempt.intent, "oauth.state_mismatch", next);
  if (input.error || !input.code) return failureUrl(origin, attempt.intent, "oauth.cancelled", next);

  let identity;
  try {
    identity = await exchangeCode(oauthEnv(), provider, {
      code: input.code,
      redirectUri: callbackUri(origin, provider),
      verifier: attempt.verifier,
      nonce: attempt.nonce,
      appleUserName: appleName(input.user),
    });
  } catch (error) {
    if (!(error instanceof OAuthExchangeError)) console.error("oauth exchange failed", error);
    return failureUrl(origin, attempt.intent, "oauth.exchange_failed", next);
  }
  if (identity.provider === "line") return failureUrl(origin, attempt.intent, "oauth.unavailable", next);

  const api = await serverApi(attempt.intent);
  const body = { provider: identity.provider, idToken: identity.idToken };
  const result =
    attempt.intent === "prospect"
      ? await api.POST("/v1/auth/prospect/identity", { body }).catch(() => null)
      : await api.POST("/v1/auth/resident/identity", { body }).catch(() => null);
  if (!result) return failureUrl(origin, attempt.intent, "service.unavailable", next);
  if (!result.data) {
    const code = (result.error as { code?: unknown } | undefined)?.code;
    return failureUrl(origin, attempt.intent, typeof code === "string" ? code : "service.unavailable", next);
  }
  for (const cookie of sessionCookies(attempt.intent, result.data)) {
    jar.set(cookie.name, cookie.value, { ...SESSION_COOKIE_FLAGS, maxAge: cookie.maxAge });
  }
  return new URL(next, origin).toString();
}
