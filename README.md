# getproperty-liff

**getproperty — บิลทำเอง เก็บเงินเอง ถูกกฎหมาย** · Collective Group (Thailand)

The resident LINE Mini App (LIFF) of getproperty (D-154): one Next.js 16 app, one zone — residents'
invoices & pay, service requests, lease & e-sign, usage, announcements, parcels, profile; and in R2 the
technicians' "my work orders". The operator console, staff PWA and platform admin are
[`getproperty-web`](../getproperty-web); the backend is [`getproperty-api`](../getproperty-api). In the
platform's naming a _tenant_ is the SaaS customer organisation and the people who live in units are
_residents_ (D-151).

Read `CLAUDE.md`, then `docs/prompts/00-master-plan.md`, `docs/decisions.md` and `docs/prompts/design-system.md`.

## Run

```sh
pnpm i                 # Node 24, pnpm 10 — copies the font files from npm on postinstall
pnpm dev:mock          # http://localhost:3300 with a fake LIFF and the contract mocks (no LINE, no API)
pnpm dev               # http://localhost:3300 with the real LIFF SDK (NEXT_PUBLIC_LIFF_ID, API_INTERNAL_URL)
pnpm storybook         # http://localhost:6006
pnpm gen:api           # regenerate API types + mock tables from the pinned contract (--adopt to bump it)
```

In mock mode open `/liff` (signs in as a resident with one unit), `/liff?liff.state=%2Flink%3Fcode%3DOK-7KQ2M9`
(invitation), or `/auth` (SMS code `123456`, `000000` = expired). The fake LIFF reads the `gp_fake_liff` cookie
(`{"sub":"U…newcomer…","inClient":false,"loggedIn":false}`; scenario words in `mocks/state.ts`).
`FEATURE_TECHNICIAN=1` shows `/technician` (R2).

## Check

```sh
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm gen:api --check
pnpm build && pnpm release:hygiene   # plain build: no fake LIFF, mock API or source maps in the bundle
pnpm e2e               # mock build (fake LIFF + contract mocks), 360 × 780, axe on every page
pnpm e2e:integration   # the same app against the real getproperty-api (PostgreSQL via its db:local);
                       # GETPROPERTY_API_REF=<commit> runs that committed API (git archive, built in a temp dir)
pnpm build-storybook && pnpm test:visual   # Storybook + visual snapshots of the shell
NEXT_PUBLIC_LIFF_MOCK=1 pnpm build && pnpm lhci   # Lighthouse budgets (docs/performance-budgets.md)
pnpm shared:check      # warn-only drift report of the copies from ../getproperty-web
pnpm brand:check       # the LINE MINI App icon and the offline page's logo match the founder's logo
```

`pnpm test` includes the BFF (allow-list, CSRF, refresh-once, cookie flags), the mock API through the BFF,
env validation, CSP, the LIFF entry (the id token never leaves it), i18n completeness/ICU/glossary, the WCAG 2.2 AA
contrast gate and axe over every copied story. On a machine that cannot download browsers:
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PW_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm e2e` (`CHROME_PATH` for `lhci`).

## Deploy (Collective platform, D-230 — ADR-0007)

One image for every environment: `docker build .` takes no build arguments, and every value — `API_INTERNAL_URL`,
`TRUSTED_HOPS` and the public ones (`NEXT_PUBLIC_LIFF_ID`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`,
`NEXT_PUBLIC_ENV_BADGE`, `NEXT_PUBLIC_ASSET_BASE_URL`, `NEXT_PUBLIC_LINE_OA_ID`) — is read at run time from the
secret `collective/<env>/getproperty/liff` (collective-infra README; getproperty-api `docs/deployment.md` §3). The
browser receives the LIFF id, Sentry DSN and environment from the server-rendered `<html data-*>` attributes.
`.github/workflows/deploy.yml` builds once per commit (main → UAT, tag `vX.Y.Z` → production) and collective-infra's
`promote.yml --component liff` can ship the UAT image to production unchanged. **No repository variables** are needed
(the former `UAT_*` / `PROD_*` LIFF / OA / VAPID / Sentry variables can be deleted); the GitHub Environments `uat` /
`production` hold `AWS_DEPLOY_ROLE_ARN`, `INSTANCE_ID`, `AWS_REGION` as for the other getproperty images.

### LINE Developers console (per environment's LINE Login channel → LIFF / LINE MINI App)

| What              | Value / file                                                                                                                                                                                             | Where                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| LIFF endpoint URL | `https://<liff host>/liff`                                                                                                                                                                               | LIFF tab of the channel           |
| LIFF id           | → secret key `NEXT_PUBLIC_LIFF_ID`                                                                                                                                                                       | read by the server at start       |
| Channel icon      | [`docs/brand/line/getproperty-line-mini-app-icon.png`](docs/brand/line/getproperty-line-mini-app-icon.png) — 130 × 130 PNG, the founder's app icon (white house on the house blue), the house 70 px wide | **Basic settings → Channel icon** |

The icon follows LINE's published MINI App icon guideline (developers.line.biz → LINE MINI App → Design → "LINE MINI
App icon": background area 130 × 130 px, logo 54–90 px with 54–76 px recommended, PNG or JPEG, LINE crops the
image itself, no LINE MINI App logo inside). `pnpm brand` regenerates it from `src/ui/brand/geometry.ts`;
`pnpm brand:check` (CI) keeps it current. **To confirm in the console when uploading** (not stated in the guideline,
so not guessed here): the maximum file size the field accepts, whether it prefers a larger square than 130 px
(re-run `pnpm brand` with another `LINE_ICON.size` if so — the ratio of 70 / 130 keeps the logo in range), the crop
shape LINE applies, and whether a verified MINI App needs further images.

## Layout

```
src/proxy.ts      per-request CSP nonce, token renewal before render, request id
src/app/(liff)    root layout; (resident)/ guarded home; /liff entry; /auth, /auth/otp; /consent; /link;
                  /signed-out; /technician (R2); not-found
src/app/bff       resident BFF (+ /bff/rum)
src/features      resident (shell, home, liff, auth, consent, link, realtime) · technician · shared
src/lib           liff · api · auth · bff · security · observability · pwa · realtime · env · flags
src/sw            service worker (app shell only) → public/sw.js
src/ui            design system — copied from getproperty-web (docs/shared-copies.md)
src/i18n          th · en · my · km · lo · zh (en fallback), per-feature messages, format.ts copied
src/domain        status presentation, typed to the contract enums
contract/         the pinned getproperty-api contract (contract.lock.json)
mocks/            contract-based MSW handlers (generated tables + CONTRACT-REQUEST mocks)
e2e/ e2e-visual/  Playwright (mock build, integration project, Storybook snapshots)
```

Docs: `docs/adr/` (0001 fonts, 0002 component base, 0003 theming — adopted; 0004 LIFF-first single zone;
0005 contract consumption & mocks; 0006 session & LIFF id-token exchange), `docs/contract-requests.md`,
`docs/i18n-glossary.md`, `docs/shared-copies.md`, `docs/performance-budgets.md`, `docs/PROGRESS.md`.
