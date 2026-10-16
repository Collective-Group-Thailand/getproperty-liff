# L1 — Foundation: LIFF login & linking, BFF & auth, contract & mocks, i18n, shell, PWA, observability

> อ่าน `CLAUDE.md`, `00-master-plan.md`, `docs/decisions.md`, `docs/contract/api-conventions.md`, `design-system.md` ก่อน · ต้องทำ L0 แล้ว · ทำทีละ Deliverable (1.1 → 1.3) ต่อ 1 session
> ต้องมี LINE Login channel + LIFF app (ของ Collective Group) และ LIFF endpoint URL = `https://<host ของ repo นี้>/liff` ก่อนทดสอบบนเครื่องจริง (CI ใช้ fake)
> ที่มา: ส่วน LIFF/auth/i18n/shell ของ getproperty-web `F1-foundation.md` และ `F3-tenant-liff.md` §3.1.1 เดิม — ปรับศัพท์ตาม D-151

---

You are a senior frontend engineer on **`getproperty-liff`**. Build the skeleton every resident screen depends on. No business screens yet.

## Deliverable 1.1 — Proxy, security, contract, BFF
1. Env schema (zod, validated at boot, server/client split): `API_INTERNAL_URL`, `API_CONTRACT_SOURCE`, `NEXT_PUBLIC_LIFF_ID`, `NEXT_PUBLIC_LIFF_MOCK`, `NEXT_PUBLIC_LINE_OA_ID`, `NEXT_PUBLIC_ASSET_BASE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `FEATURE_TECHNICIAN`, `SENTRY_*`, `NEXT_PUBLIC_ENV_BADGE`.
2. `src/proxy.ts`: per-request CSP **with nonce** (move `src/lib/security/headers.ts` there; drop `'unsafe-inline'` for scripts; keep the LINE origins; add the object-storage host for signed images), `noindex`, HSTS, `Permissions-Policy` (camera self only), access-token refresh before rendering.
3. `pnpm gen:api` wired: vendored contract + `contract.lock.json`, `openapi-typescript` → `src/lib/api/schema.d.ts`, MSW base handlers in `mocks/generated/` (resident, auth-resident and technician operations only), error-path handlers from documented problem codes incl. `compliance.*`; CI contract-drift job. If the backend contract does not have `/v1/resident/*` yet (API rename in progress, D-151), bootstrap a seed contract in `mocks/seed-openapi.json` (auth + `me`), clearly marked, and list the endpoints in `docs/contract-requests.md`.
4. `serverApi()` / `browserApi` (openapi-fetch): `Accept-Language`, request id, problem details → typed `ApiError` (`code`, `detail`, `legalRef`, field errors), automatic `Idempotency-Key` for flagged operations (payments, signatures, notices), query-key factory, TanStack Query defaults.
5. `createBffHandler()` replacing the 501 placeholder: allow-list `/v1/resident`, `/v1/auth/resident` (+ `/v1/technician`, `/v1/auth/technician` when `FEATURE_TECHNICIAN=1`), bearer from the httpOnly cookie, refresh-once on `401`, cookie rotation, streaming passthrough (PDF, SSE), same-origin + `x-getproperty-csrf: 1` on non-GET, body size limit (photos by presign), no caching.
6. Tests: Vitest for the BFF (allow-list incl. refusal of `/v1/owner` and `/v1/admin`, CSRF, refresh-once, cookie flags `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`); CSP nonce present on every HTML response.

## Deliverable 1.2 — LIFF login, account linking, consent, magic link
1. `/liff` (replace the L0 placeholder steps, keep the wrapper): `liff.init` → login if needed → `liff.getIDToken()` → `POST /bff/auth/line` → `/v1/auth/resident/line` → cookies → `router.replace(resolveLiffState(...))`. The id token is never stored (no state, no storage, no logs — add a unit test that asserts the wrapper's result object does not contain it).
2. **Account linking**: invitation code from the deep link (`liff.state=/link?code=…` from the operator's invite QR/SMS) → `POST /v1/resident/link` → which unit(s) the party now occupies; expired/used code states.
3. **Consent screen** (D-025): purposes from the API, versioned; accept → home; withdrawal later in profile (L3).
4. **Outside LINE**: magic-link page (phone → SMS → `/v1/auth/resident/magic-link/verify`), phone OTP with `OTPInput`; "open in LINE" helper.
5. `getActor()` reading `/v1/resident/me` (party, occupancies → units, language, consents, entitlements), cached per request; guards in the layout; logout; unit switcher for residents with several occupancies.
6. Locale: `/v1/resident/me.language` wins over the cookie once signed in; the switcher writes both.
7. Tests: Playwright on MSW with the fake LIFF — logged-in in-client path, outside-LINE login redirect path (fake), linking with valid/expired code, consent; magic-link path; an owner/staff cookie from getproperty-web never authenticates here (different host, different audience).

## Deliverable 1.3 — Shell, i18n, domain presentation, PWA, observability, quality gates
1. **Shell**: header with unit code + building name (from `me`), unit switcher, bottom nav (Home, Bills, Usage, Repairs (R2), Me) from `me.entitlements`; LINE-native feel (full-bleed cards, 16 px gutters, 48 px targets); works inside LIFF and as a standalone page; technician shell (R2) without the resident nav.
2. **i18n**: messages per feature (`messages/<locale>/{shared,resident,technician}/*.json` or namespaced files), ICU plurals, glossary (th ↔ en, D-151 terms), my/km/lo/zh scaffolding kept empty with English fallback (filled in L4).
3. **Domain presentation**: `src/domain/status/{invoice,payment,lease,deposit,serviceRequest,workOrder,parcel,reading}.ts` typed to the generated enums (copy shape from getproperty-web; if getproperty-web has the same file, copy it and list it in `docs/shared-copies.md`); `ComplianceNotice` with `legalRef`.
4. **PWA**: service worker (Workbox) with app-shell caching only — never cache invoices, receipts or personal data; web push (VAPID) offered after a meaningful action (first payment).
5. **Observability**: Sentry, OpenTelemetry fetch instrumentation, Web Vitals RUM through the BFF with LIFF context (in-client, OS) — never the id token or LINE profile; request id in error states.
6. **Realtime**: SSE client (ids only → TanStack invalidation) for payment status.
7. **Quality gates**: Lighthouse CI job (`pnpm lhci`, built with `NEXT_PUBLIC_LIFF_MOCK=1`), axe in Playwright for every page, Storybook visual snapshots of the shell, `shared:check` job.
8. ADR-0005 (contract consumption & mocks), ADR-0006 (session & LIFF id-token exchange); `docs/PROGRESS.md` entry.
