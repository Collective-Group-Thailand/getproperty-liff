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
pnpm dev:mock          # http://localhost:3300 with a fake LIFF (no LINE account needed)
pnpm dev               # http://localhost:3300 with the real LIFF SDK (needs NEXT_PUBLIC_LIFF_ID)
pnpm storybook         # http://localhost:6006
```

Open `/liff?liff.state=%2Fbills` to walk the LIFF entry with a deep link. `FEATURE_TECHNICIAN=1` shows
`/technician` (R2).

## Check

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e && pnpm build-storybook
pnpm release:hygiene   # after a plain `pnpm build`: no fake LIFF, mocks or source maps in the bundle
pnpm shared:check      # warn-only drift report of the copies from ../getproperty-web
```

`pnpm test` includes the WCAG 2.2 AA contrast gate, axe over every copied Storybook story, the LIFF
wrapper/fake/deep-link tests, the formatter tests and the lint fixtures. `pnpm e2e` builds with the fake
LIFF and checks home and `/liff` at 360 × 780 with axe. On a machine that cannot download browsers:
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PW_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm e2e`.

## Layout

```
src/app/(liff)    root layout, home, /liff entry, /technician (R2), not-found
src/app/bff       resident BFF (501 until L1)
src/features      resident · technician
src/lib           liff (wrapper + fake) · security (CSP) · pwa · flags · (L1) api · auth · bff · observability
src/ui            design system — copied from getproperty-web (docs/shared-copies.md)
src/i18n          th · en · my · km · lo · zh (en fallback), format.ts copied
src/domain        status presentation — copied
```

Docs: `docs/adr/` (0001 fonts, 0002 component base, 0003 theming — adopted; 0004 LIFF-first single
zone), `docs/shared-copies.md`, `docs/performance-budgets.md`, `docs/PROGRESS.md`.
