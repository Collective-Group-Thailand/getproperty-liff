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
  handlers separately. Several server processes (a restart overlapping a deploy, or a second replica) can still
  race; since api `a352998` (D-229) the API answers the
  immediately previous token within 30 s of its rotation with the **same** successor pair instead of revoking the
  family, so that race no longer signs anyone out (review M3).
- **CSRF.** Every non-GET BFF call needs `x-getproperty-csrf: 1` and a same-origin `Origin`/`Sec-Fetch-Site`
  (`APP_ORIGIN` when a proxy rewrites `Host`); CORS is never granted, so a cross-site page can do neither.
- **Guards.** `getActor()` reads `/v1/resident/me` once per request; the `(resident)` layout sends signed-out
  visitors to `/liff?liff.state=…` inside LINE's in-app browser and to `/auth?next=…` elsewhere, and residents
  with missing required consents to `/consent?next=…` (D-025). Every `next`/`liff.state` passes
  `safeInternalPath` — never an open redirect. Invitation acceptance (`/link`) comes before consent.
- **Logout** calls `/v1/auth/logout` for every refresh token the browser holds and clears all session cookies. It is
  `POST` with the CSRF checks only (`405` otherwise): a cross-site link must not sign residents out (review L1).
- **Edge trust** (review H2, L4). The client address sent to the API is the `X-Forwarded-For` entry `TRUSTED_HOPS`
  from the right (the one our own edge appended; the platform's Caddy = 1, D-230), never the left-most one; with 0
  nothing is sent.
  An inbound `x-request-id` is kept only when it is a UUID.
- **Realtime stream token** (review L5). `POST …/realtime/auth` answers through the BFF with the token in an httpOnly
  `__Host-gp_sst` / `__Host-gp_tsst` cookie (≤ 60 s) and a `streamUrl` without it; the BFF puts it back into the
  API's query string. The API takes the token only in the query (EventSource cannot send headers), so it still
  appears in the API's platform request log (its own pino logs record the path only); it lives 60 s and opens one
  ids-only stream.

## Consequences
- No token is ever in JS, storage, logs or analytics; Sentry and RUM payloads are scrubbed of cookies, bodies and
  query strings.
- Every page is rendered per request (cookies, nonce) — acceptable for personal pages that are never cached.
