# 00 — Master Plan: getproperty-liff (resident LINE Mini App)

> อ่านไฟล์นี้ก่อนทุก session แล้วค่อยเปิด prompt ของ deliverable ที่ได้รับมอบหมาย (L0–L4)
> Repo นี้คือ **แอปผู้อยู่อาศัยบน LINE (LIFF)** — Next.js app เดียว zone เดียว (D-154) · operator console / staff PWA / platform admin อยู่ที่ `getproperty-web` · backend อยู่ที่ `getproperty-api`

---

## 1. Role
You are a senior frontend engineer on **`getproperty-liff`**, the LINE Mini App of **getproperty — บิลทำเอง เก็บเงินเอง ถูกกฎหมาย** (Collective Group (Thailand)), the Building Operations platform (D-150). The product promise is zero-touch billing (D-011): the resident gets the invoice in LINE with a Thai QR, pays in two taps, and the receipt comes back by itself. The resident's screen is *a bill that is pleasant to pay* (D-100): see the amount, the units, the meter photo; scan to pay. This repo delivers the resident and (R2) technician interfaces; `getproperty-api` delivers every behaviour and all data.

**Audiences and naming (D-151)**
| Audience | Who | API prefix | Token audience | Release |
|---|---|---|---|---|
| resident | a **party** with an `occupancy` of a `unit` — lessee, co-resident, owner-occupier (condo, later) | `/v1/resident/*` | `resident` | R1 |
| technician | an external technician **party** assigned `work_order`s | `/v1/technician/*` | `technician` | R2 |

A **tenant** is the SaaS customer organisation that operates the building (apartment first); residents never see the word. Domain terms in code and English copy: `unit`, `building`, `lease`, `occupancy`, `invoice` / `invoice_line` (source rent / meter / common_fee / fund / penalty / service / deposit), `payment`, `receipt`, `service_request`, `work_order`, `announcement`, `parcel`. Thai copy uses everyday words (ห้อง, บิล, แจ้งซ่อม).

## 2. Structure
```
getproperty-liff/
├─ src/
│  ├─ app/
│  │  ├─ (liff)/layout.tsx            the only root layout: html lang (gp_locale ← liff.getLanguage), theme=system, data-zone="resident", safe areas, providers
│  │  ├─ (liff)/page.tsx              resident home (unit card, open-invoice hero, tiles)
│  │  ├─ (liff)/liff/page.tsx         LIFF endpoint: init → login → (L1) id-token exchange → liff.state deep link
│  │  ├─ (liff)/technician/page.tsx   my work orders (R2, FEATURE_TECHNICIAN=1)
│  │  ├─ (liff)/[...rest]/page.tsx    catch-all → not-found inside the layout
│  │  ├─ (liff)/{bills,invoices/[id],pay,receipts,usage,lease,notice,requests,announcements,parcels,profile}/   L2–L4
│  │  ├─ bff/[...path]/route.ts       resident BFF (501 in L0; createBffHandler in L1)
│  │  ├─ manifest.ts  global-error.tsx  icon.svg
│  ├─ features/resident/<domain>/      shell, home, liff, invoices, pay, usage, lease, requests…
│  ├─ features/technician/<domain>/    work orders (R2)
│  ├─ ui/                              design system — COPIED from getproperty-web (docs/shared-copies.md)
│  ├─ domain/status/                   status presentation — copied; typed to contract enums in L1
│  ├─ i18n/                            six locales (th, en; my/km/lo/zh → en fallback), format.ts copied
│  └─ lib/
│     ├─ liff/                         LiffClient wrapper, fake, deep links, entry flow, openExternal
│     ├─ api/ auth/ bff/ observability/   L1
│     ├─ pwa/                          manifest (+ service worker L1)
│     ├─ security/                     CSP + headers
│     └─ flags.ts
├─ e2e/  .storybook/  lighthouse/  scripts/ (tokens, contrast, fonts, gen-api, shared-check, lhci, release-hygiene)
└─ docs/  prompts/ adr/ contract/ ui/ decisions.md shared-copies.md PROGRESS.md contract-requests.md
```

## 3. Auth (L1)
- **LIFF id-token exchange**: `/liff` → `liff.init({ liffId })` → `liff.isLoggedIn()` or `liff.login()` (outside LINE) → `liff.getIDToken()` → `POST /bff/auth/line` → BFF → `POST /v1/auth/resident/line` → `__Host-gp_at` / `__Host-gp_rt` httpOnly cookies → redirect to the `liff.state` target. The id token is never stored in JS. Account linking: an invitation code in `liff.state` (from the operator's invite QR/SMS) links the LINE user to the resident party; then the consent screen (purposes from the API, versioned, D-025).
- **Magic-link fallback** outside LINE (and when LINE is unavailable): phone → SMS link (`/v1/auth/resident/magic-link`) → same cookies.
- **Technicians (R2)**: same flow with audience `technician` (`/v1/auth/technician/line`).
- `getActor()` reads `/v1/resident/me` (party, occupancies → units, language, consents, entitlements); a resident with several units gets a unit switcher.

## 4. Data access (BFF — L1)
- Server Components: `serverApi()` → `API_INTERNAL_URL` with the bearer from the cookie, `Accept-Language`.
- Client Components: `browserApi` → `/bff` + TanStack Query. The BFF allow-lists `/v1/resident/*`, `/v1/auth/resident/*` (and R2 `/v1/technician/*`, `/v1/auth/technician/*`), attaches the token, refreshes once on `401`, streams (receipt PDFs, SSE payment status), requires same-origin + `x-getproperty-csrf: 1` on non-GET, never caches authenticated responses. Slip and photo uploads go to object storage by presigned URL.
- No `X-Tenant-Id` header: the resident's tenant context comes from the token/occupancy, not from a switcher.

## 5. Contract sync
`pnpm gen:api` (copied from getproperty-web) reads `API_CONTRACT_SOURCE` (local `../getproperty-api/contract/openapi.json`; CI the release asset in `contract.lock.json`) → `src/lib/api/schema.d.ts` → MSW handlers in `mocks/generated/` — only the `/v1/resident/*`, `/v1/auth/resident/*` and `/v1/technician/*` operations are used. CI fails on drift. Missing endpoints → `docs/contract-requests.md` + `// CONTRACT-REQUEST` mock.

## 6. Platform baseline
Same as getproperty-web: Next.js 16 (App Router, RSC), React 19, TypeScript strict, Tailwind v4, pnpm 10, Node ≥ 24, Radix + CVA, Storybook 10, Vitest + Testing Library (+ axe per story), Playwright (+ axe, 360 × 780), Lighthouse CI, MSW, next-intl — plus `@line/liff`. Deployed as its own container (`getproperty/liff`, standalone Next.js, linux/arm64) on Collective's shared AWS platform beside getproperty-web and getproperty-api (D-230, ADR-0007: collective-infra, Caddy in front, the API at `http://getproperty-api:3000` on the docker network); the LIFF endpoint URL in the LINE Developers console points at `/liff` on this host.

## 7. Run order
| Step | Prompt | Output | Needs from backend | Release |
|---|---|---|---|---|
| L0 | `L0-setup.md` | repo, tooling, copied design system, LIFF wrapper + fake, placeholders (done) | nothing | R1 |
| L1 | `L1-foundation.md` 1.1 → 1.3 | LIFF init/login/linking, BFF + auth, contract + MSW, i18n 6 locales, shell, PWA base, observability, quality gates | B1.1 contract, `/v1/auth/resident/line` | R1 |
| L2 | `L2-bills-pay.md` 2.1 → 2.2 | home on real data, invoices, pay (QR, slip), receipts | B4.2–B4.4 | R1 |
| L3 | `L3-lease-usage-profile.md` 3.1 → 3.3 | lease & e-sign, move-out notice, deposit response, usage, profile & consent | B2.2–B2.4, B3.2, B1.3 | R1 |
| L4 | `L4-r2-service-requests-community-technician.md` 4.1 → 4.4 | service requests, announcements, parcels, access, my/km/lo/zh, technician work orders | B5 (A4) | R2 |
L2 and L3 run in parallel after L1 against MSW mocks. Before L1: a LINE Login channel + LIFF app (Collective Group) with the endpoint URL on this app's host.

## 8. Definition of Done (every screen/flow)
- Lint, typecheck, unit/component, e2e green; axe clean (WCAG 2.2 AA); 360 × 780 with no horizontal scroll; keyboard path works; performance budget met (`lighthouse/resident.json`: LCP ≤ 2.0 s on 4G mid-range, CLS ≤ 0.05, ≤ 150 KB initial JS).
- Works inside LIFF (fake in CI; real iOS + Android LINE in the release checklist) and as a standalone mobile page.
- Runs against the real backend in the integration environment; no `CONTRACT-REQUEST` mock left for that screen.
- Thai + English strings (my/km/lo/zh fall back to English until L4); statuses via `src/domain/status`; compliance problems with `legalRef`.
- Payments and signatures send an `Idempotency-Key`; success states feel final (receipt, signed copy).
- `docs/PROGRESS.md` updated: screens done, decisions implemented, deviations, contract requests, any `src/ui` copy refreshed.

## 9. ADRs
0001 Thai-first typography · 0002 Component base · 0003 Theming (all adopted from getproperty-web) · 0004 LIFF-first single-zone app. L1 adds 0005 Contract consumption & mocks and 0006 Session & LIFF id-token exchange.
