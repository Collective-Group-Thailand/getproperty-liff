# Performance budgets (design-system.md §7, D-179)

Enforced with Lighthouse CI (`pnpm lhci`, configs in `lighthouse/`, built with `NEXT_PUBLIC_LIFF_MOCK=1`)
and, from L1, Web Vitals RUM posted through the BFF. On a shared CI runner LCP/INP/CLS are **warnings**
(a lab run is not a p75); the initial JS size and the accessibility score are **errors** — the JS budget is a
**hard limit** (D-179, 2026-10-17).

| Route type | LCP (p75) | INP (p75) | CLS | JS shipped (gz, initial) | Lighthouse set |
|---|---|---|---|---|---|
| Resident LIFF pages | ≤ 2.0 s on 4G mid-range inside LINE | ≤ 200 ms | ≤ 0.05 | ≤ 180 KB | `resident`, `public` |
| Technician pages (R2) | ≤ 2.5 s on 4G mid-range | ≤ 200 ms | ≤ 0.1 | ≤ 180 KB | `technician` (L4) |

`resource-summary:script:size` is asserted as the budget in bytes (180 KB → 184 320). The reference device
is a 360 × 780 Android phone (Lighthouse mobile preset, 4× CPU slowdown, 1.6 Mbps). `pnpm lhci` prints the
measured size of every URL after each set (`initial JS [set] url: a–b KB`).

## Why 180 KB (D-179)

React 19 + the Next 16 runtime alone are ≈ 137 KB gz on every page here (react-dom 72.2, the router 39.0,
the rest of Next's client 25.4). The old 150 KB target left 13 KB for the whole app; D-179 re-based the
resident budget to 180 KB and made it a hard limit once the reductions below landed.

## Measured (2026-10-17, transferred script bytes; `pnpm lhci` reports the same figures)

| Set | URL | Before (L1) | After (D-179 work) | Budget |
|---|---|---|---|---|
| `resident` | `/` (home, signed in) | 193.0 KB | 168.9 KB | 180 KB |
| `resident` | `/link` | 202.9 KB | 171.1 KB | 180 KB |
| `public` | `/liff` (entry → home) | 207.4 KB | 174.8 KB | 180 KB |
| `public` | `/auth` | 201.9 KB | 171.1 KB | 180 KB |
| `public` | `/auth/otp` | 208.5 KB | 174.4 KB | 180 KB |
| `public` | `/signed-out` | 192.2 KB | 167.2 KB | 180 KB |

`/liff` counts the LIFF entry *and* the home route it hands over to (a client-side navigation inside the
measured load).

### Founder's logo + run-time public settings (2026-10-21, `pnpm lhci`, every set passes)

The logo is server-rendered markup (the shells, the entry screens, the root not-found page) — its path data is in
the HTML, never in a script (`brand-boundary.test.ts`, `e2e/brand.spec.ts`). The public settings moved from
build-time inlining to the server-rendered `<html data-liff-id data-sentry-dsn data-env>` (D-230: one image for every
environment): the reader (`src/lib/publicConfig.ts`) replaces the inlined strings, and Sentry's lazy chunk is now
referenced by the client instrumentation (loaded only when a DSN is set at run time). `/profile` **184 272 bytes**
(2 under `a352998`'s 184 274; 48 under the limit).

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident` | `/`, `/invoices`, `/invoices/<id>`, `/receipts`, `/link` | 171.3, 171.2, 173.5, 173.4, 172.3 KB | 180 KB |
| `resident` | `/lease`, `/lease/<id>/notice`, `/deposit`, `/usage` | 177.7, 175.1, 178.1, 174.3 KB | 180 KB |
| `resident` | `/profile`, `/profile/privacy` | **180.0** (184 272 B), 174.3 KB | 180 KB |
| `resident-r2` | `/requests`, `/requests/new`, `/requests/<id>` | 169.9, 176.8, 175.3 KB | 180 KB |
| `resident-r2` | `/announcements`, `/parcels`, `/facilities`, `/facilities/<id>`, `/rules`, `/contacts`, `/access` | 170.9, 169.9, 172.4, 174.9, 177.0, 171.4, 176.7 KB | 180 KB |
| `technician` | `/technician`, `/technician/work-orders/<id>` | 169.3, 179.6 KB | 180 KB |
| `public` | `/liff`, `/auth`, `/auth/otp`, `/signed-out` | 174.3–177.8, 171.9, 175.6, 167.8 KB | 180 KB |
| `resident-sign`, `resident-moveout` | `/lease/<id>/sign`, `/deposit` | 175.3, 178.1 KB | 180 KB |

### D-230 platform image (2026-10-21, `pnpm lhci`, every set passes)

`/api/healthz` and `/api/metrics` are server-only route handlers (the Prometheus client is a server external): no
client chunk changed — `/profile` **179.9 KB**, technician work order 179.6, `/deposit` 178.1, home 171.3.

### LIFF #29–#31 api `0428349` (2026-10-21, `pnpm lhci`, every set passes)

The pending card's watcher (`LinkPendingWatch`: realtime `party.link_changed`, in-place "check again", rescope /
declined) is loaded on demand through `LinkPendingLazy` (`React.lazy`): a home with nothing pending never downloads it
(home 171.3 → **171.4 KB**, the wrapper; a first build that imported the watcher directly measured 172.5 KB). The
shell's realtime bridge listens to three more events (`payment.held`, `payment.dismissed`, `party.link_changed`): that
alone took `/profile` 7 bytes over the hard limit (184 327 > 184 320), so the bridge's dead `/me` invalidation
(`consent.changed`, `occupancy.*`, `lease.*` → a query key no client component reads — `/me` is server-rendered) was
dropped; `/profile` is back **at 180.0 KB** (within the limit, no headroom gained). The pay sheet's "the office is
checking your transfer" callout lives in the on-demand sheet (e2e: ≤ 50 KB still holds); the technician's pending card is
server-rendered.

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident` | `/`, `/invoices`, `/invoices/<id>`, `/receipts`, `/link` | 171.4, 171.3, 173.6, 173.5, 171.8 KB | 180 KB |
| `resident` | `/lease`, `/lease/<id>/notice`, `/deposit`, `/usage` | 177.8, 174.7, 177.7, 174.4 KB | 180 KB |
| `resident` | `/profile`, `/profile/privacy` | **180.0**, 174.4 KB | 180 KB |
| `resident-r2` | `/requests`, `/requests/new`, `/requests/<id>` | 170.0, 176.8, 175.4 KB | 180 KB |
| `resident-r2` | `/announcements`, `/parcels`, `/facilities`, `/facilities/<id>`, `/rules`, `/contacts`, `/access` | 171.0, 170.0, 172.5, 174.5, 177.1, 171.5, 176.4 KB | 180 KB |
| `technician` | `/technician`, `/technician/work-orders/<id>` | 169.2, 179.1 KB | 180 KB |
| `public` | `/liff`, `/auth`, `/auth/otp`, `/signed-out` | 174.0–177.7, 171.8, 175.5, 167.8 KB | 180 KB |
| `resident-sign`, `resident-moveout` | `/lease/<id>/sign`, `/deposit` | 175.4, 177.7 KB | 180 KB |

### Independent review fixes, api `a352998` (2026-10-21, `pnpm lhci`, every set passes)

Adopting the contract alone took `/profile` 20 bytes over the hard limit (the four new idempotent operations in the
shell's list: 184 340 > 184 320). Kept within it by: the sign-out code loaded on demand (`src/lib/auth/signOut.ts`, from
the settings menu and the profile button); the realtime bridge without its list of 29 event names (the BFF delivers
every event as a default message with its `type` in the data) and without the query-key module (`events.ts` writes the
five prefixes out, pinned to `qk` by a test); `IdempotentAttempt` creating its key with `crypto.randomUUID()` instead
of importing `idempotency.ts` — that import moved Turbopack's loader manifest into an extra 1.2 KB request on every
page. `/profile` is now 184 274 bytes (46 under the limit, 24 below `0428349`).

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident` | `/`, `/invoices`, `/invoices/<id>`, `/receipts`, `/link` | 171.3, 171.2, 173.5, 173.4, 172.3 KB | 180 KB |
| `resident` | `/lease`, `/lease/<id>/notice`, `/deposit`, `/usage` | 177.7, 175.1, 178.1, 174.3 KB | 180 KB |
| `resident` | `/profile`, `/profile/privacy` | **179.9**, 174.3 KB | 180 KB |
| `resident-r2` | `/requests`, `/requests/new`, `/requests/<id>` | 169.8, 176.7, 175.3 KB | 180 KB |
| `resident-r2` | `/announcements`, `/parcels`, `/facilities`, `/facilities/<id>`, `/rules`, `/contacts`, `/access` | 170.9, 169.8, 172.4, 174.9, 177.0, 171.4, 176.7 KB | 180 KB |
| `technician` | `/technician`, `/technician/work-orders/<id>` | 169.3, 179.6 KB | 180 KB |
| `public` | `/liff`, `/auth`, `/auth/otp`, `/signed-out` | 174.3, 171.8, 175.6, 167.8 KB | 180 KB |
| `resident-sign`, `resident-moveout` | `/lease/<id>/sign`, `/deposit` | 175.3, 178.1 KB | 180 KB |

### Release fixes api `048a8bd` (2026-10-21, `pnpm lhci`, every set passes)

Every URL is unchanged to the tenth of a KB: the D-226 "waiting for the office to confirm" card on home is
server-rendered (its "check again" is a plain link), the session rotation for new scopes is a server redirect through
the `/auth/rescope` route handler, and the slip reason is copy. `/profile` stays **at 180.0 KB** (nothing was added to the
shell), the technician work order at 179.1 KB.

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident` | `/`, `/invoices`, `/invoices/<id>`, `/receipts`, `/link` | 171.3, 171.3, 173.6, 173.5, 171.8 KB | 180 KB |
| `resident` | `/lease`, `/lease/<id>/notice`, `/deposit`, `/usage` | 177.8, 174.7, 177.7, 174.4 KB | 180 KB |
| `resident` | `/profile`, `/profile/privacy` | **180.0**, 174.4 KB | 180 KB |
| `resident-r2` | `/requests`, `/requests/new`, `/requests/<id>` | 170.0, 176.8, 175.4 KB | 180 KB |
| `resident-r2` | `/announcements`, `/parcels`, `/facilities`, `/facilities/<id>`, `/rules`, `/contacts`, `/access` | 171.0, 170.0, 172.5, 174.5, 177.1, 171.5, 176.4 KB | 180 KB |
| `technician` | `/technician`, `/technician/work-orders/<id>` | 169.2, 179.1 KB | 180 KB |
| `public` | `/liff`, `/auth`, `/auth/otp`, `/signed-out` | 174.0–177.6, 171.8, 175.5, 167.8 KB | 180 KB |
| `resident-sign`, `resident-moveout` | `/lease/<id>/sign`, `/deposit` | 175.4, 177.7 KB | 180 KB |

### Contract adoption api `18b160e` (2026-10-21, `pnpm lhci`, every set passes)

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident-r2` | `/requests/<id>` (photos, history, SLA, visit confirmation; thread loaded near the screen) | 175.4 KB | 180 KB |
| `resident-r2` | `/requests`, `/requests/new` | 170.0, 176.8 KB | 180 KB |
| `resident-r2` | `/announcements`, `/parcels`, `/contacts` | 171.0, 170.0, 171.5 KB | 180 KB |
| `resident-r2` | `/facilities`, `/facilities/<id>`, `/rules`, `/access` (visitor policy) | 172.5, 174.5, 177.1, 176.4 KB | 180 KB |
| `technician` | `/technician`, `/technician/work-orders/<id>` (photo links, preferred visit, lazy thread) | 169.2, 179.1 KB | 180 KB |
| `resident` | `/`, `/invoices`, `/invoices/<id>`, `/receipts` | 171.3, 171.3, 173.6, 173.5 KB | 180 KB |
| `resident` | `/lease`, `/lease/<id>/notice`, `/deposit`, `/usage`, `/link` | 177.8, 174.7, 177.7, 174.4, 171.8 KB | 180 KB |
| `resident` | `/profile`, `/profile/privacy` | **180.0**, 174.4 KB | 180 KB |
| `public` | `/liff`, `/auth`, `/auth/otp`, `/signed-out` | 174.0, 171.8, 175.5, 167.8 KB | 180 KB |
| `resident-sign`, `resident-moveout` | `/lease/<id>/sign`, `/deposit` | 175.4, 177.7 KB | 180 KB |

The request thread (`LazyRequestThread`) loads when it comes within 200 px of the screen (and is warmed on the first
tap): the technician work order went from 180.1 KB with the typed thread inline to 179.1 KB. `/profile` grew 0.2 KB
from the shell's realtime bridge (the `service_request.message` signal to the open thread) and is **at the budget** —
nothing more may be added to the shell or `/profile` without moving something out first.

### L4 screens (2026-10-21, same method; `pnpm lhci resident-r2 technician resident`, all sets pass)

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident-r2` | `/requests` | 169.8 KB | 180 KB |
| `resident-r2` | `/requests/new` (photo picker; `CameraCapture` on tap) | 176.7 KB | 180 KB |
| `resident-r2` | `/requests/<id>` (timeline, thread, rating) | 176.2 KB | 180 KB |
| `resident-r2` | `/announcements`, `/parcels`, `/contacts` | 170.8, 169.8, 171.3 KB | 180 KB |
| `resident-r2` | `/facilities`, `/facilities/<id>` (availability, booking form) | 172.3, 174.3 KB | 180 KB |
| `resident-r2` | `/rules`, `/access` | 176.9, 176.1 KB | 180 KB |
| `technician` | `/technician` (my work orders) | 169.2 KB | 180 KB |
| `technician` | `/technician/work-orders/<id>` (actions, photos, cost lines) | 179.2 KB | 180 KB |
| `resident` | `/` (home with the R2 tiles) | 171.1 KB | 180 KB |
| `resident` | `/profile` (six-language select) | 179.8 KB | 180 KB |

CLS 0 on every URL; LCP 1.6–3.4 s lab (warning; the machine was shared with other builds). The other `resident`
URLs moved by < 1.5 KB. The script fonts cost no JS (CSS `@font-face` only, never in a th/en stack). **Least headroom:
`/profile` (≈ 0.2 KB) and the technician work order (≈ 0.8 KB)** — the next client widget on either must be lazy.

### L3 screens (2026-10-17, same method)

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident` | `/lease` (→ the one lease) | 176.7 KB | 180 KB |
| `resident` | `/lease/<id>/notice` | 173.3 KB | 180 KB |
| `resident` | `/deposit` (held) | 174.0 KB | 180 KB |
| `resident` | `/usage` (chart lazy) | 173.4 KB | 180 KB |
| `resident` | `/profile` | 178.5 KB | 180 KB |
| `resident` | `/profile/privacy` | 173.4 KB | 180 KB |
| `resident-sign` | `/lease/<id>/sign` | 174.2 KB (first cut 181.9) | 180 KB |
| `resident-moveout` | `/deposit` (settlement to answer) | 174.0 KB | 180 KB |

CLS 0 and accessibility 1.0 on every L3 URL; LCP 1.5–3.3 s lab (warning, as before — the run shared the machine
with another Lighthouse job). How the e-signature page got under the limit: the reading step is rendered on the
server and handed to the client flow as a prop (`SignReader`), and the steps that are not on screen when the page
opens load on demand — `SignaturePad` and `OTPInput` (`lazyWarm`, warmed by the first tap or key press) and the
"I have read it" checkbox (Radix) once the end of the lease has been reached. The usage chart is its own chunk
(`next/dynamic`, `ssr: false`) behind a server-rendered data table. `/profile/privacy` had CLS 0.16–0.17 from the
display font re-wrapping long Thai consent titles; those titles are now body-font text (not headings) and the page
title is shorter — CLS 0. **`/profile` has the least headroom (≈ 1.5 KB)**: the next client widget there should be
lazy.

### L2 screens (2026-10-17, same method; `pnpm lhci resident public`, all sets pass)

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident` | `/` (home with the open invoice as the hero and "scan to pay") | 171.5 KB | 180 KB |
| `resident` | `/invoices` | 171.5 KB | 180 KB |
| `resident` | `/invoices/<id>` (open invoice: lines, meter photo, PDF, pay button) | 173.8 KB | 180 KB |
| `resident` | `/receipts` | 173.7 KB | 180 KB |
| `public` | `/liff`, `/auth`, `/auth/otp`, `/signed-out` | 174.6, 172.3, 176.1, 168.3 KB | 180 KB |

The L1/L3 pages moved by ≈ +1.1–1.3 KB (the shared root: the LIFF wrapper's share picker, the realtime event
list); **`/profile` is at 179.8 KB** — the next client code there must be lazy. CLS 0 and accessibility 1.0 on every
URL; LCP 1.8–3.1 s lab (warning, as before).

**The pay sheet is not initial JS.** It opens in place from the home hero, an invoice card or the invoice page and
is loaded by that tap (`lazyOverlay`): the sheet (Radix Dialog), TanStack Query, the QR encoder (`uqr`), the QR panel
and, warmed while it is open, the paid state — **46 KB gz on demand**, asserted ≤ 50 KB in e2e (`bills.spec.ts`,
"loaded on demand by the tap"). The slip flow (camera, compression, stepper) is a further chunk loaded only when
"send the slip" is tapped. A cold open of `/invoices/<id>?pay=1` (a link that asks for the sheet) loads both — 217 KB
measured with the first cut — so no screen of the app links there; it exists for direct links only and is not in a
Lighthouse set. First cut: the slip panel and the camera were inside the sheet chunk (55 KB on demand).

## What made the difference

Measured in three steps on the same pages (the first step bundles four changes made together):

| Change | Saved (gz) |
|---|---|
| **Re-sync with getproperty-web's D-179 work** — *per-icon glyph modules* (`<Icon icon={IconX}>`, one plain-data module per glyph in `src/ui/icons/glyphs/<name>.ts`, generated by `pnpm icons` from `curated.ts`; the by-name registry only in stories/tests; ESLint refuses it and `lucide-react`, now a dev dependency, in app code), *precompiled messages* (next-intl `experimental.messages.precompile`: catalogs compiled to ICU ASTs at build time, the client on the format-only runtime; the my/km/lo/zh → en fallback merges compiled values key by key, as before), *TanStack Query on demand* (the root layout no longer mounts a query client; `QueryProvider` from `@/lib/api/QueryProvider` wraps the components that use queries — L2's invoices and pay status — and `@/lib/api/query-runtime` lets the realtime bridge invalidate once a client exists) and *toasts on first use* (`Toaster`/`toast` load sonner with the first toast; replaces `DeferredToaster`). Also available now: `@/ui/components/overlays` (`LazySheet`, `LazyDialog`, `LazyAlertDialog`, `LazyDropdownMenu`) for new screens — the unit and settings sheets were already lazy (L1) — and `SegmentedControl` without Radix. | ≈ 24 KB on every page (`/` 193.0 → 169.1, `/auth/otp` 208.5 → 185.2) |
| **Lean root not-found.** The root `not-found.tsx` is part of every page's tree; with the resident shell inside it, every page shipped the shell's client half a second time. Unknown paths now render in the `(shell)` group (its layout is the shell); the root boundary is client-free. | ≈ 12 KB where the page also draws the shell (`/link` 179.8 → 168.1, `/auth/otp` 185.2 → 173.5) |
| **Shell client modules in the root layout** (`SharedShellModules`). Every page is framed by the resident shell, so its client half (settings menu, unit switcher, `Button`, `Link`) belongs to the root layout's bundle that every route shares; before, each route group carried its own copy and the LIFF entry → home navigation downloaded it twice. Costs ≈ 3 KB on pages that drew less of it. | ≈ 10 KB on `/liff` (185.2 → 174.8); `/link`, `/auth` +3 KB |

## What is left

- **Framework floor ≈ 137 KB.**
- **`tailwind-merge` ≈ 9.6 KB** (`cn`) — kept; see getproperty-web's performance-budgets.md.
- **Web Vitals (`next/web-vitals`) ≈ 3.5 KB** and next-intl's client runtime ≈ 3.3 KB in the root layout.
- **`/liff` and `/auth/otp` are the closest (≈ 5 KB headroom).** In production the LIFF SDK is loaded by
  dynamic import only on `/liff` (the mock build replaces it with the 1.6 KB fake), so the real `/liff` load is
  larger than this lab figure; keep anything else off that page.

## Sets

`resident` (`/`, L2: `/invoices`, `/invoices/<id>`, `/receipts` — the invoice id derived from the mock subject,
`mocks/billing.ts` `mockInvoiceId` —, `/link`, L3: `/lease`, `/lease/<id>/notice`, `/deposit`, `/usage`, `/profile`,
`/profile/privacy` — signed in through the mock API's seed refresh token sent as a cookie), `resident-sign`
(`/lease/<id>/sign` of the mock signer) and `resident-moveout` (`/deposit` with a settlement to answer) — lease ids
in URLs are derived from the mock subject (`mocks/residence.ts` `mockLeaseId`, checked by `mocks.test.ts`) — and
`public` (`/liff`, `/auth`, `/auth/otp`, `/signed-out`). Set `CHROME_PATH` where Chrome is not installed (e.g. the
Playwright Chromium). `pnpm lhci` starts a production server on 3400 against a
`NEXT_PUBLIC_LIFF_MOCK=1` build with `API_MOCKS=1`; as root it adds `--no-sandbox` to Chrome. CI job
`lighthouse`. To see what is in a bundle: `pnpm analyze` (webpack build with `@next/bundle-analyzer`,
`.next/analyze/client.html`) or `pnpm exec next analyze` (Turbopack's analyzer); rebuild before `pnpm lhci`.

Techniques: RSC by default, client components only where interactive (the LIFF entry, the pay sheet),
the LIFF SDK loaded by dynamic import only where LIFF is used, self-hosted Thai-first fonts (two
preloaded), `next/image` with `sizes` for meter photos, no layout shift from fonts or images.

## History

- **L1 (2026-10-17)** — accessibility 1.0 everywhere; initial JS 193–209 KB against the 150 KB budget
  (failing); the gap was recorded as a deferred decision.
- **D-179 (2026-10-17)** — budget re-based to 180 KB and enforced as a hard limit after the reductions above;
  both sets pass.
- **L3 (2026-10-17)** — eight more URLs in three sets, all under 180 KB (sign page 181.9 → 174.2 KB by
  server-rendering the reader and loading later steps on demand).
- **L2 (2026-10-17)** — four more URLs (home on real data, invoices, an invoice, receipts), all under 180 KB; the
  pay sheet measured on demand (46 KB, budget 50 KB in e2e).

### GL3 contracts & renewals (2026-10-28, `pnpm lhci` in the sandbox with `CHROME_PATH` = Playwright Chromium; every set passes)

Measured at HEAD before GL3: `/lease/<id>` **180.8 KB** (over); after the G0–G3 contract adoption (the generated
idempotent-operation list ships in a shared chunk) `/profile` reached 181.4 KB and the technician work order 181.1 KB.
Fixes: the lease rules checkbox and the technician cost-line form and photo pickers load as they come near the screen
(`src/features/shared/WhenNear.tsx`, Radix checkbox ≈ 8 KB gz); the notification preferences form moved to
`/profile/notifications` (the profile shows a summary). New set `lighthouse/resident-contracts.json`.

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `resident-contracts` | `/contracts`, `/contracts/<id>`, `/contracts/<id>/sign`, `/renewals/<id>`, `/lease/<id>` | 171.2, 173.8, 176.9, 175.6, 175.7 KB | 180 KB |
| `resident` | `/`, `/invoices`, `/invoices/<id>`, `/receipts`, `/link`, `/lease`, `/lease/<id>/notice`, `/deposit`, `/usage` | 172.7, 172.6, 174.9, 174.8, 173.7, 175.7, 176.5, 179.5, 175.6 KB | 180 KB |
| `resident` | `/profile`, `/profile/privacy`, `/profile/notifications` | 175.3, 175.7, 178.6 KB | 180 KB |
| `resident-r2` | `/requests`, `/requests/new`, `/requests/<id>`, `/announcements`, `/parcels`, `/facilities`, `/facilities/<id>`, `/rules`, `/contacts`, `/access` | 171.2, 178.2, 176.7, 172.2, 171.2, 173.8, 176.3, 178.4, 172.8, 178.2 KB | 180 KB |
| `resident-sign`, `resident-moveout` | `/lease/<id>/sign`, `/deposit` | 176.9, 179.5 KB | 180 KB |
| `technician` | `/technician`, `/technician/work-orders/<id>` | 170.6, 176.6 KB | 180 KB |
| `public` | `/liff`, `/auth`, `/auth/otp`, `/signed-out` | 175.8, 173.3, 177.0, 169.2 KB | 180 KB |

### GL2 self-viewing for prospects (2026-10-28, `pnpm lhci` in the sandbox with `CHROME_PATH` = Playwright Chromium; every set passes)

New set `lighthouse/prospect.json` (the prospect pages had no set): first measured at 182.2 (listing, book mode),
183.1 (self-viewing booking) and 188.2 KB (enquiry with an open door-code window). Fixes: the Radix checkbox of the
consent, the visitor terms and the rent-record share loads near the screen (`LazyCheckbox` + `WhenNear`); the
rent-record share panel and the enquiry write box load near the screen; the reschedule picker loads with its sheet;
the phone OTP form loads only for a prospect without a verified phone; the door-code panel paints a light view
(`AccessView`) and loads its actions (dialogs, attempts, the code fetch) on the first tap.

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `prospect` | `/rent/<slug>?mode=book`, `/rent/<slug>/self-viewing`, `/rent/enquiries/<id>` (self viewing, window open) | 176.5, 175.3, 179.6 KB | 180 KB |
| other sets | as in the GL3 table | unchanged (±0.1 KB) | 180 KB |

### GL1 recommended places (2026-10-29, `pnpm lhci recommendations resident` in the sandbox with `CHROME_PATH` = Playwright Chromium; both sets pass)

New set `lighthouse/recommendations.json` (resident and prospect cookies together: `/recommendations` renders for
the resident, `/rent/recommendations` for the prospect; subjects `adsseen` have a sent history). The screen is
server-rendered (status, consent text, limits, history); only the one-tap withdraw is client code on the first load,
and the preferences form (inputs, area search, the Radix consent checkbox) loads as it comes near the screen
(`LazyPreferencesForm` + `WhenNear`). The profile row and the enquiries card are server markup (no script). The G4 /
G5 / G8 contract growth did not move the resident pages.

| Set | URL | Initial JS | Budget |
|---|---|---|---|
| `recommendations` | `/recommendations`, `/recommendations/history`, `/rent/recommendations`, `/rent/enquiries` | 172.8, 172.8, 172.8, 169.2 KB | 180 KB |
| `resident` | `/`, `/invoices`, `/invoices/<id>`, `/receipts`, `/link`, `/lease`, `/lease/<id>/notice`, `/deposit`, `/usage` | 172.7, 172.6, 175.0, 174.9, 173.7, 175.8, 176.6, 179.6, 175.7 KB | 180 KB |
| `resident` | `/profile`, `/profile/privacy`, `/profile/notifications` | 175.4, 175.8, 178.7 KB | 180 KB |
| other sets | not re-run (no shared code changed for them) | as in the GL2 table | 180 KB |
