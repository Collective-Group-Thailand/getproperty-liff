# eslint-rules

Project-local ESLint rules, loaded by `eslint.config.mjs` as the `getproperty` plugin. Copied from
`getproperty-web` (see `docs/shared-copies.md`); the zone-boundaries rule is not here because this app
has one zone.

| Rule                  | Where it applies                | What it refuses                                                         |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `no-money-arithmetic` | `src/features/**`, `src/app/**` | arithmetic on, or `Number()` of, an API money / meter field — CLAUDE.md |

`eslint.config.mjs` also refuses `window.open` (use `openExternal()` → `liff.openWindow`) and imports of
`@line/liff` outside `src/lib/liff` (use the mockable wrapper). The rule has a fixture test beside it
(`*.test.ts`, run by `pnpm test`) that proves it fails on the code it exists to catch.
