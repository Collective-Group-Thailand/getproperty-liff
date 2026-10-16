# Shared copies from `getproperty-web` (D-154, D-155)

`getproperty-liff` has no package to import the design system from until `collective-shared` exists
(D-155), so it **copies** what a resident app needs from `getproperty-web`. This table is the manifest
`pnpm shared:check` reads; every text file listed carries a first-line header

```
// copied from getproperty-web@<commit> until collective-shared exists (D-155)
```

(`/* … */` in CSS, `<!-- … -->` in Markdown, `{/* … */}` in MDX; `— adapted: …` when it was changed).

**Modes** — `verbatim`: identical to the source apart from the header · `adapted`: deliberately changed
(single resident zone, subset barrel, LIFF rules), reported but never flagged · `generated`: produced here
by a copied script (`pnpm tokens`) and compared byte for byte · `binary`: font files, byte for byte.

**Re-sync procedure**: change the file in `getproperty-web` first (it is the source of truth), copy it
here, update the header and the commit below, run `pnpm shared:check` (warn-only; `--strict` to fail on
drift), then `pnpm test` (the axe gate runs every copied story). Not copied on purpose: DataTable,
Combobox, Select, Checkbox, RadioCards, Switch, DatePicker, Popover, Tooltip (no hover-only UI in LIFF)
— copy them when a resident screen first needs one.

Tooling copied once at bootstrap and then owned here (not tracked): `.nvmrc`, `.prettierrc`,
`.prettierignore`, `.gitignore`, `postcss.config.mjs`, `tsconfig.json`, `vitest.config.mts`,
`eslint.config.mjs` (adapted), `playwright.config.ts` (rewritten), `lighthouse/shared.json`,
`pnpm-lock.yaml` (re-resolved), `.github/pull_request_template.md`.

Source commit for every row below: **`08ff63b`** (getproperty-web `main`, 2026-10-16 — the D-154 change
that removed its resident zone).


## Design system — `src/ui`

| Path | Mode | Source commit |
|---|---|---|
| `src/ui/README.md` | adapted | `08ff63b` |
| `src/ui/brand/Mark.tsx` | verbatim | `08ff63b` |
| `src/ui/brand/Wordmark.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/brand/Wordmark.tsx` | verbatim | `08ff63b` |
| `src/ui/brand/config.ts` | verbatim | `08ff63b` |
| `src/ui/brand/index.ts` | verbatim | `08ff63b` |
| `src/ui/components/AlertDialog.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/AlertDialog.tsx` | verbatim | `08ff63b` |
| `src/ui/components/AppShell.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/AppShell.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Badge.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Badge.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Button.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Button.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Callout.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Callout.tsx` | verbatim | `08ff63b` |
| `src/ui/components/CameraCapture.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/CameraCapture.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Card.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Card.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Dialog.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Dialog.tsx` | verbatim | `08ff63b` |
| `src/ui/components/DropdownMenu.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/DropdownMenu.tsx` | verbatim | `08ff63b` |
| `src/ui/components/EmptyState.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/EmptyState.tsx` | verbatim | `08ff63b` |
| `src/ui/components/ErrorState.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/ErrorState.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Field.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Field.tsx` | verbatim | `08ff63b` |
| `src/ui/components/IconButton.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/IconButton.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Input.tsx` | verbatim | `08ff63b` |
| `src/ui/components/MoneyDisplay.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/MoneyDisplay.tsx` | verbatim | `08ff63b` |
| `src/ui/components/OTPInput.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/OTPInput.tsx` | verbatim | `08ff63b` |
| `src/ui/components/PhoneInput.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/PhoneInput.test.ts` | verbatim | `08ff63b` |
| `src/ui/components/PhoneInput.tsx` | verbatim | `08ff63b` |
| `src/ui/components/SegmentedControl.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/SegmentedControl.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Sheet.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Sheet.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Skeleton.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Skeleton.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Spinner.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Spinner.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Stat.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Stat.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Tabs.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Tabs.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Timeline.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Timeline.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Toast.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Toast.tsx` | verbatim | `08ff63b` |
| `src/ui/components/index.ts` | adapted | `08ff63b` |
| `src/ui/docs/Principles.mdx` | adapted | `08ff63b` |
| `src/ui/docs/Tokens.mdx` | verbatim | `08ff63b` |
| `src/ui/docs/VoiceAndTone.mdx` | verbatim | `08ff63b` |
| `src/ui/docs/tokens-blocks.tsx` | verbatim | `08ff63b` |
| `src/ui/fonts/README.md` | verbatim | `08ff63b` |
| `src/ui/fonts/files/anuphan-latin.woff2` | binary | `08ff63b` |
| `src/ui/fonts/files/anuphan-thai.woff2` | binary | `08ff63b` |
| `src/ui/fonts/files/jetbrains-mono-latin.woff2` | binary | `08ff63b` |
| `src/ui/fonts/files/noto-sans-thai-latin.woff2` | binary | `08ff63b` |
| `src/ui/fonts/files/noto-sans-thai-thai.woff2` | binary | `08ff63b` |
| `src/ui/fonts/index.ts` | verbatim | `08ff63b` |
| `src/ui/generated/tokens.css` | generated | `08ff63b` |
| `src/ui/icons/Icon.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/icons/Icon.tsx` | verbatim | `08ff63b` |
| `src/ui/icons/index.ts` | verbatim | `08ff63b` |
| `src/ui/icons/registry.ts` | verbatim | `08ff63b` |
| `src/ui/index.ts` | verbatim | `08ff63b` |
| `src/ui/lib/cn.test.ts` | verbatim | `08ff63b` |
| `src/ui/lib/cn.ts` | verbatim | `08ff63b` |
| `src/ui/lib/index.ts` | verbatim | `08ff63b` |
| `src/ui/lib/useReturnFocus.ts` | verbatim | `08ff63b` |
| `src/ui/styles/base.css` | verbatim | `08ff63b` |
| `src/ui/styles/zones.css` | adapted | `08ff63b` |
| `src/ui/test/axe.ts` | verbatim | `08ff63b` |
| `src/ui/test/setup.ts` | verbatim | `08ff63b` |
| `src/ui/test/stories.a11y.test.tsx` | verbatim | `08ff63b` |
| `src/ui/test/stories.test.ts` | verbatim | `08ff63b` |
| `src/ui/theme/ThemeProvider.tsx` | verbatim | `08ff63b` |
| `src/ui/theme/ThemeToggle.tsx` | verbatim | `08ff63b` |
| `src/ui/theme/index.ts` | verbatim | `08ff63b` |
| `src/ui/theme/server.ts` | verbatim | `08ff63b` |
| `src/ui/theme/themes.test.ts` | adapted | `08ff63b` |
| `src/ui/theme/themes.ts` | adapted | `08ff63b` |
| `src/ui/tokens/README.md` | verbatim | `08ff63b` |
| `src/ui/tokens/color.ts` | verbatim | `08ff63b` |
| `src/ui/tokens/contrast.test.ts` | verbatim | `08ff63b` |
| `src/ui/tokens/index.ts` | verbatim | `08ff63b` |
| `src/ui/tokens/primitives.ts` | verbatim | `08ff63b` |
| `src/ui/tokens/scale.ts` | verbatim | `08ff63b` |
| `src/ui/tokens/semantic.ts` | verbatim | `08ff63b` |

## i18n formatters and status presentation

| Path | Mode | Source commit |
|---|---|---|
| `src/domain/status/index.ts` | verbatim | `08ff63b` |
| `src/domain/status/status.test.ts` | verbatim | `08ff63b` |
| `src/i18n/format.test.ts` | verbatim | `08ff63b` |
| `src/i18n/format.ts` | verbatim | `08ff63b` |

## App, scripts, lint rules, Storybook

| Path | Mode | Source commit |
|---|---|---|
| `.storybook/fonts.css` | verbatim | `08ff63b` |
| `.storybook/main.ts` | verbatim | `08ff63b` |
| `.storybook/preview.css` | verbatim | `08ff63b` |
| `.storybook/preview.tsx` | adapted | `08ff63b` |
| `eslint-rules/no-money-arithmetic.mjs` | verbatim | `08ff63b` |
| `eslint-rules/no-money-arithmetic.test.ts` | verbatim | `08ff63b` |
| `scripts/build-tokens.ts` | verbatim | `08ff63b` |
| `scripts/check-contrast.ts` | verbatim | `08ff63b` |
| `scripts/copy-fonts.ts` | verbatim | `08ff63b` |
| `scripts/gen-api.ts` | verbatim | `08ff63b` |
| `scripts/lhci.ts` | adapted | `08ff63b` |
| `scripts/release-hygiene.ts` | adapted | `08ff63b` |
| `src/app/global-error.tsx` | verbatim | `08ff63b` |

## Reference docs

| Path | Mode | Source commit |
|---|---|---|
| `docs/prompts/design-system.md` | verbatim | `08ff63b` |
| `docs/ui/brand.md` | verbatim | `08ff63b` |
| `docs/ui/voice-and-tone.md` | verbatim | `08ff63b` |
