# ADR-0004 — LIFF-first single-zone app

**Status:** Accepted (2026-10-16, L0) · follows from D-154 (getproperty-web ADR-0008); replaces the
planned getproperty-web ADR-0006 "LIFF-first tenant zone"

## Context
The resident experience — invoices and payment, service requests, lease and e-signature, move-out
notice, usage, announcements, parcels, profile and consent — is used almost entirely inside LINE's
in-app browser on mid-range Android phones over 4G (design-system.md §1.6). D-154 makes it a separate
repository so its bundle is not shaped by the owner console and its release cadence is its own. R2
adds external technicians ("my work orders"), who also live in LINE. D-151 names the audience
`resident` (and `technician`); "tenant" is the SaaS customer organisation.

## Decision
- **One zone, no host routing.** One root layout (`src/app/(liff)/layout.tsx`) stamps
  `<html lang data-theme data-zone="resident">`; there is no `proxy.ts` host mapping. The technician
  screens (R2, `/technician`, behind `FEATURE_TECHNICIAN=1`) are routes in the same app with their own
  `me`, allow-list and navigation — not a second zone.
- **LIFF first, mobile web second.** Every page works inside LIFF and as a standalone mobile page
  (magic-link fallback, L1). The LIFF endpoint is `/liff`: `liff.init` → login → (L1: id-token exchange
  through the BFF into httpOnly cookies) → `liff.state` deep link resolved to a known in-app path, never
  an open redirect (`src/lib/liff/deepLink.ts`).
- **The SDK behind a wrapper.** `src/lib/liff` exposes a `LiffClient` interface implemented by the real
  `@line/liff` and by an in-memory fake. `NEXT_PUBLIC_LIFF_MOCK=1` (always defined in `next.config.ts`,
  so it is inlined) selects the fake for tests and `pnpm dev:mock`; a production build never contains
  it (`pnpm release:hygiene`). ESLint refuses `@line/liff` outside the wrapper and `window.open`
  everywhere — links out use `openExternal()` → `liff.openWindow`.
- **LINE-native constraints are rules**: safe-area insets (`viewport-fit=cover` + `env(safe-area-inset-*)`
  under `data-zone="resident"`), 48 px targets, 16 px base, no hover-only interaction, bottom sheets,
  follow the phone's theme, the 360 × 780 viewport with no horizontal scroll as the e2e reference.
- **Security**: the CSP allows only `'self'` plus LINE's SDK/Login/API/CDN origins
  (`src/lib/security/headers.ts`, unit-tested); camera only for `self`; every response `noindex`. L1
  moves the CSP into `src/proxy.ts` with a per-request nonce and drops `'unsafe-inline'` for scripts.
- **BFF only** (L1): browser code calls `/bff/*`, which allow-lists `/v1/resident/*`,
  `/v1/auth/resident/*` and (R2) `/v1/technician/*`; tokens live only in httpOnly cookies.
- **Shared design system by copy** until `collective-shared` (D-155): `docs/shared-copies.md` +
  `pnpm shared:check` (warn-only).
- **Six locales** (D-064): th default, en complete; my/km/lo/zh scaffolded with English fallback; locale
  from the `gp_locale` cookie, first set from `liff.getLanguage()`.

## Consequences
- The resident bundle carries no owner/admin code; the budget is LCP ≤ 2.0 s, CLS ≤ 0.05, ≤ 150 KB
  initial JS (`lighthouse/resident.json`).
- Two copies of the design system can drift; drift is visible, not prevented.
- Testing never needs a LINE account: the fake drives unit tests and Playwright; a real-device pass in
  LINE (iOS + Android) is part of each release's manual checklist.
