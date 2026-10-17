# ADR-0006 — Session & LIFF id-token exchange

**Status:** Accepted (2026-10-17, L1) · implements contract §4, D-060, D-061, D-163, D-164

## Context
Residents open the app inside LINE (LIFF) or, without LINE, from an SMS link. The API is cookie-agnostic: its
login endpoints return an access token (EdDSA JWT, 15 min) and a single-use rotating refresh token (30 days;
reusing a rotated one revokes the whole sign-in, D-163). Tokens must never be readable by page scripts
(CLAUDE.md), the LINE id token must never be stored, and getproperty-web's operator sessions must never count
here.

## Decision
- **Exchange through the BFF.** `/liff` runs `liff.init` → `liff.login()` when needed (outside LINE: LINE Login
  and back) → `liff.getIDToken()` → `POST /bff/auth/line` → `/v1/auth/resident/line`. The id token exists only
  inside `runLiffEntry` between the SDK and that request body (unit test: not in the result, the step reports or
  logs). SMS: `/v1/auth/resident/otp/request` → `/auth/otp` → `/v1/auth/resident/otp/verify`. Technicians (R2,
  `FEATURE_TECHNICIAN=1`): `/bff/auth/technician/line` for deep links into `/technician`.
- **Cookies only.** The BFF turns every token pair into `__Host-gp_at` / `__Host-gp_rt` (residents) or
  `__Host-gp_tat` / `__Host-gp_trt` (technicians): `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`,
  `Max-Age` = token lifetime. The browser receives `{ subject, accessTokenExpiresAt }` only. `__Host-` cookies are
  host-only, so getproperty-web's cookies (another host) are never sent here; a token of another audience that
  did arrive is refused by the API (`auth.wrong_audience`) and treated as signed out.
- **Renewal.** The proxy renews a missing or expiring access token **before rendering** (Server Components cannot
  set cookies) and hands the new cookies to the render via `NextResponse.cookies`. The BFF renews before calling
  when the token is stale and **once** on a 401, retries once, and always writes the rotated pair back. A refresh
  the API rejects (4xx) clears the session; an unreachable API keeps it.
- **Single-flight refresh, process-wide.** Concurrent refreshes of one refresh token in a process share one call,
  and its result is remembered for 20 s, so a page render and its client fetches cannot spend the same token twice
  (which would end the sign-in). The map lives on `globalThis` because Next bundles the proxy and the route
  handlers separately. Several Cloud Run instances can still race; renewing 60 s before expiry keeps the window
  small. If it shows in production, the fix is a refresh grace window in the API (contract request), not more
  client cleverness.
- **CSRF.** Every non-GET BFF call needs `x-getproperty-csrf: 1` and a same-origin `Origin`/`Sec-Fetch-Site`
  (`APP_ORIGIN` when a proxy rewrites `Host`); CORS is never granted, so a cross-site page can do neither.
- **Guards.** `getActor()` reads `/v1/resident/me` once per request; the `(resident)` layout sends signed-out
  visitors to `/liff?liff.state=…` inside LINE's in-app browser and to `/auth?next=…` elsewhere, and residents
  with missing required consents to `/consent?next=…` (D-025). Every `next`/`liff.state` passes
  `safeInternalPath` — never an open redirect. Invitation acceptance (`/link`) comes before consent.
- **Logout** calls `/v1/auth/logout` for every refresh token the browser holds and clears all session cookies.

## Consequences
- No token is ever in JS, storage, logs or analytics; Sentry and RUM payloads are scrubbed of cookies, bodies and
  query strings.
- Every page is rendered per request (cookies, nonce) — acceptable for personal pages that are never cached.
