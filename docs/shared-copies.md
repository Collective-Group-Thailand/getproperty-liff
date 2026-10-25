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
by a copied script (`pnpm tokens`, `pnpm icons`) and compared byte for byte · `binary`: font files, byte for byte.
A row `dir/*.ext` (the icon glyphs: one generated module per icon, D-179) stands for every such file in
either checkout, so a glyph added or removed on one side shows as missing.

**Re-sync procedure**: change the file in `getproperty-web` first (it is the source of truth), copy it
here, update the header and the commit below, run `pnpm shared:check` (warn-only; `--strict` to fail on
drift), then `pnpm test` (the axe gate runs every copied story). Not copied on purpose: DataTable,
Combobox, Select, RadioCards, Switch, DatePicker, Popover, Tooltip (no hover-only UI in LIFF)
— copy them when a resident screen first needs one. Checkbox was copied in L1 (`4d107cc`) for the consent screen.

Tooling copied once at bootstrap and then owned here (not tracked): `.nvmrc`, `.prettierrc`,
`.prettierignore`, `.gitignore`, `postcss.config.mjs`, `tsconfig.json`, `vitest.config.mts`,
`eslint.config.mjs` (adapted), `playwright.config.ts` (rewritten), `lighthouse/shared.json`,
`pnpm-lock.yaml` (re-resolved), `.github/pull_request_template.md`.

Source commits: **`08ff63b`** (getproperty-web `main`, 2026-10-16 — the D-154 change that removed its
resident zone) for the bootstrap copies; **`4d107cc`** for Checkbox (L1); **`f57d4dc`** (2026-10-17, D-179) for
the re-sync after getproperty-web's F1 and initial-JS work: per-icon glyph modules (`<Icon icon={IconX}>`,
`scripts/build-icons.ts`), `lib/lazy.tsx` + `components/overlays.tsx` (no Popover here), the toast facade
(`Toast` + `ToastViewport`), `SegmentedControl` without Radix, `toE164` in `lib/phone.ts`, new `Breadcrumbs`,
`CountBadge`, `EnvBadge`, `IconButton` `badge`, `BottomNav` `size="lg"`, the `ErrorState` request-id contrast
fix, and design-system.md §7 with the D-179 budgets. **L3 (2026-10-17)**: `SignaturePad` (+ stories) from
**`6a8ffcf`** (getproperty-web F4 4.1, which built it in `src/ui` — L3 3.1 asks for exactly that order); `curated.ts`
gains only that commit's `undo`, `sign`, `image` (same keys and Lucide glyphs, so the generated glyph files are
byte-identical) and is `adapted` until the full re-sync of 6a8ffcf's other additions (torch, backspace, swap, …),
which no resident screen needs yet. `shared:check` may report drift where getproperty-web has uncommitted edits.

**L2 (2026-10-17) — re-sync from getproperty-web's committed `777d767`** (`SHARED_SOURCE=<git archive of 777d767>
pnpm shared:check --strict`: 0 drift, so working-tree edits of other sessions never leak in): the real
**`CameraCapture`** (live rear camera, torch, guide frame, multi-shot tray, on-device compression; `labels` prop) and its
stories from **`6a8ffcf`** — `ScanButton` moved out of it there and is not copied (a resident never scans) —, **`lib/image.ts`**
(+ test, `compressImage`/`toFile`) and **`SignaturePad`** (`initial` draft) from **`7b560af`**, **`Progress`** (upload and QR validity
bars) and **`Stepper`** (the slip steps) with their stories, `curated.ts` back to **verbatim** with every glyph of `6a8ffcf`
(unused glyphs cost nothing: one module per icon), `registry.ts`, `stories.test.ts`. Not copied, no resident screen needs
them: `BigActionButton`, `NumericKeypad` + `lib/decimal.ts`, `ScanButton`/`ScanPanel`, `Combobox`, `DataTable`, `DatePicker`,
`Popover`, `RadioCards`, `Select`, `Switch`, `Tooltip`. The deposit dispute moved to the new `CameraCapture` API
(`useCameraLabels`, `common.camera` copy as in getproperty-web's `staff.capture.camera`).

**Founder's logo (2026-10-21) — getproperty-web's committed `79541bc`** (its `docs/shared-copies.md` list; `git archive`
of web HEAD `7cf057e` = `0f759fe` + docs → `SHARED_SOURCE=… pnpm shared:check --strict`: 0 drift): `src/ui/brand/*`
(the founder's paths in `geometry.ts`, `Mark` / `Wordmark` server components, `brand.test.tsx`), `tokens/primitives.ts` +
`semantic.ts` (brand ramp replaces teal, `logo-*` keys) and the regenerated `tokens.css`, `check-contrast.ts` /
`build-tokens.ts`, `Stat`, `SegmentedControl` (`fullWidth`) + stories, `Tokens.mdx`, `Principles.mdx` (adapted: the
`primary` line), `src/ui/README.md` (adapted: the Brand paragraph), `docs/ui/brand.md`, the ESLint palette guard
(`teal` → `brand`, adapted) and every brand binary (section "Brand files"). Removed: the placeholder
`public/brand/wordmark.svg`, `src/app/icon.svg`. Not copied: getproperty-web's `scripts/build-brand.ts` (its outputs are
copied instead; this app's own `scripts/build-brand.ts` writes only the LINE channel icon and the offline page's logo).

**L4, second pass (2026-10-21) — getproperty-web's committed `7f6030b`** (its F2 2.7 / F4 4.4 commits landed while L4 was
under way; `SHARED_SOURCE=<git archive 7f6030b> pnpm shared:check --strict`: 262 copies, 0 drift): the R2 glyphs
`archive`, `calendar-check`, `contact`, `door`, `package-check`, `receipt`, `rules`, `timer`, `unlock`, `wrench`
(`curated.ts`, `registry.ts`; the home's facilities / door codes / house rules / contacts tiles use them) and
`format.ts` `formatTime` + test. getproperty-web now also has status maps for `booking`, `credential`,
`accessResult`, `parcel`, `priority`; this repo's own maps of those domains (L4, liff-owned — only `index.ts` and
`status.test.ts` are copies) stay as they are, with their labels in this repo's `shared/status.json`.

**L4 (2026-10-20) — re-sync from getproperty-web's committed `2493107`** (`git archive 2493107` → `SHARED_SOURCE=…
pnpm shared:check --strict`: 252 copies, 238 same, 14 adapted, 0 drift; the other session's uncommitted working-tree edits
in getproperty-web never reach this repo): `AlertDialog` (`confirmDisabled`), `Checkbox` and `Switch` with `data-testid` on
the control, `format.ts` (`formatDecimal`, `formatPeriodKey`) + test, and the new primitives the R2 screens use —
**`SimpleTable`** (technician cost lines, own unlock log), **`NativeSelect`** (service category, facility, cost kind),
**`ImageViewer`** (zoomable photo of a request / work order), **`DescriptionList`** (request, parcel and work-order facts),
**`Switch`** — with their stories; the barrel exports them. Still not copied: `Chart` (usage keeps its own lazy SVG chart),
`FileDropzone` (no drag-and-drop on a phone; `CameraCapture` + file input), `LinkTabs`, `Pagination` (lists load more),
`BigActionButton`, `NumericKeypad`, `Combobox`, `DataTable`, `DatePicker`, `Popover`, `RadioCards`, `Select`, `Tooltip`.
The Noto Sans Myanmar / Khmer / Lao / SC subsets (L4 4.3) are **owned here for now** (`src/fonts/` — `files/*.woff2` and the
generated `scripts.css`, from `scripts/script-fonts.ts`; not in this manifest): getproperty-web's `src/ui/fonts` has no such subsets yet and this session may not edit getproperty-web —
move them there (and back into this manifest as `binary` rows) when getproperty-web's console gains those locales.

**Re-sync 2026-10-25** (from getproperty-web **`2005ad0`**, `pnpm shared:check`: 291 copies, 0 drift): Anuphan is now the only UI typeface here too (web switched on 2026-10-24: `src/ui/fonts/index.ts`, `.storybook/fonts.css`, `scripts/copy-fonts.ts`, the README; the two Noto Sans Thai files and their rows are gone), `Progress` gained `tone`, the scroll wrappers of `Tabs` / `SimpleTable` / `CameraCapture` / `ImageViewer` became `relative`, `CountBadge`, `cn`, the type scale and `tokens.css`, `format.ts` (+ test), `curated.ts` (+ `book`, `calculator`, `globe`, `percent`, `printer` glyphs, regenerated with `pnpm icons`) and `design-system.md`; `Tokens.mdx` names Anuphan (fixed in getproperty-web first, `a2bd4b6`).


## Design system — `src/ui`

| Path | Mode | Source commit |
|---|---|---|
| `src/ui/README.md` | adapted | `79541bc` |
| `src/ui/brand/Mark.tsx` | verbatim | `79541bc` |
| `src/ui/brand/Wordmark.stories.tsx` | verbatim | `79541bc` |
| `src/ui/brand/Wordmark.tsx` | verbatim | `79541bc` |
| `src/ui/brand/brand.test.tsx` | verbatim | `79541bc` |
| `src/ui/brand/config.ts` | verbatim | `79541bc` |
| `src/ui/brand/geometry.ts` | generated | `79541bc` |
| `src/ui/brand/index.ts` | verbatim | `79541bc` |
| `src/ui/components/AlertDialog.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/AlertDialog.tsx` | verbatim | `838a6bf` |
| `src/ui/components/AppShell.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/AppShell.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Badge.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Badge.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Breadcrumbs.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Breadcrumbs.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Button.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Button.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Callout.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Callout.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/CameraCapture.stories.tsx` | verbatim | `6a8ffcf` |
| `src/ui/components/CameraCapture.tsx` | verbatim | `2005ad0` |
| `src/ui/components/Card.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Card.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Checkbox.stories.tsx` | verbatim | `2493107` |
| `src/ui/components/Checkbox.tsx` | verbatim | `2493107` |
| `src/ui/components/CountBadge.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/CountBadge.tsx` | verbatim | `2005ad0` |
| `src/ui/components/DescriptionList.stories.tsx` | verbatim | `2493107` |
| `src/ui/components/DescriptionList.tsx` | verbatim | `2493107` |
| `src/ui/components/Dialog.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Dialog.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/DropdownMenu.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/DropdownMenu.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/EmptyState.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/EmptyState.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/EnvBadge.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/EnvBadge.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/ErrorState.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/ErrorState.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Field.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Field.tsx` | verbatim | `08ff63b` |
| `src/ui/components/IconButton.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/IconButton.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/ImageViewer.stories.tsx` | verbatim | `2493107` |
| `src/ui/components/ImageViewer.tsx` | verbatim | `2005ad0` |
| `src/ui/components/Input.tsx` | verbatim | `08ff63b` |
| `src/ui/components/MoneyDisplay.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/MoneyDisplay.tsx` | verbatim | `08ff63b` |
| `src/ui/components/NativeSelect.stories.tsx` | verbatim | `2493107` |
| `src/ui/components/NativeSelect.tsx` | verbatim | `2493107` |
| `src/ui/components/OTPInput.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/OTPInput.tsx` | verbatim | `08ff63b` |
| `src/ui/components/PhoneInput.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/PhoneInput.test.ts` | verbatim | `08ff63b` |
| `src/ui/components/PhoneInput.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Progress.stories.tsx` | verbatim | `2005ad0` |
| `src/ui/components/Progress.tsx` | verbatim | `2005ad0` |
| `src/ui/components/SegmentedControl.stories.tsx` | verbatim | `79541bc` |
| `src/ui/components/SegmentedControl.tsx` | verbatim | `79541bc` |
| `src/ui/components/SegmentedControl.test.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Sheet.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Sheet.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/SimpleTable.stories.tsx` | verbatim | `2493107` |
| `src/ui/components/SimpleTable.tsx` | verbatim | `2005ad0` |
| `src/ui/components/Skeleton.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/SignaturePad.stories.tsx` | verbatim | `6a8ffcf` |
| `src/ui/components/SignaturePad.tsx` | verbatim | `7b560af` |
| `src/ui/components/Skeleton.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Spinner.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Spinner.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Stat.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Stat.tsx` | verbatim | `79541bc` |
| `src/ui/components/Stepper.stories.tsx` | verbatim | `6a8ffcf` |
| `src/ui/components/Stepper.tsx` | verbatim | `6a8ffcf` |
| `src/ui/components/Switch.stories.tsx` | verbatim | `2493107` |
| `src/ui/components/Switch.tsx` | verbatim | `2493107` |
| `src/ui/components/Tabs.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Tabs.tsx` | verbatim | `2005ad0` |
| `src/ui/components/Timeline.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Timeline.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Toast.stories.tsx` | verbatim | `08ff63b` |
| `src/ui/components/Toast.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/Toast.test.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/ToastViewport.tsx` | verbatim | `f57d4dc` |
| `src/ui/components/index.ts` | adapted | `2493107` |
| `src/ui/components/overlays.tsx` | adapted | `f57d4dc` |
| `src/ui/docs/Principles.mdx` | adapted | `79541bc` |
| `src/ui/docs/Tokens.mdx` | verbatim | `a2bd4b6` |
| `src/ui/docs/VoiceAndTone.mdx` | verbatim | `08ff63b` |
| `src/ui/docs/tokens-blocks.tsx` | verbatim | `08ff63b` |
| `src/ui/fonts/README.md` | verbatim | `2005ad0` |
| `src/ui/fonts/files/anuphan-latin.woff2` | binary | `08ff63b` |
| `src/ui/fonts/files/anuphan-thai.woff2` | binary | `08ff63b` |
| `src/ui/fonts/files/jetbrains-mono-latin.woff2` | binary | `08ff63b` |
| `src/ui/fonts/index.ts` | verbatim | `2005ad0` |
| `src/ui/generated/tokens.css` | generated | `2005ad0` |
| `src/ui/icons/Icon.stories.tsx` | verbatim | `f57d4dc` |
| `src/ui/icons/Icon.tsx` | verbatim | `f57d4dc` |
| `src/ui/icons/Icon.test.tsx` | verbatim | `f57d4dc` |
| `src/ui/icons/curated.ts` | verbatim | `2005ad0` |
| `src/ui/icons/glyph.ts` | verbatim | `f57d4dc` |
| `src/ui/icons/glyphs/*.ts` | generated | `7f6030b` |
| `src/ui/icons/index.ts` | verbatim | `f57d4dc` |
| `src/ui/icons/registry.ts` | generated | `2005ad0` |
| `src/ui/index.ts` | verbatim | `f57d4dc` |
| `src/ui/lib/cn.test.ts` | verbatim | `08ff63b` |
| `src/ui/lib/cn.ts` | verbatim | `2005ad0` |
| `src/ui/lib/image.test.ts` | verbatim | `7b560af` |
| `src/ui/lib/image.ts` | verbatim | `7b560af` |
| `src/ui/lib/index.ts` | verbatim | `f57d4dc` |
| `src/ui/lib/lazy.test.tsx` | verbatim | `f57d4dc` |
| `src/ui/lib/lazy.tsx` | verbatim | `f57d4dc` |
| `src/ui/lib/phone.ts` | verbatim | `f57d4dc` |
| `src/ui/lib/useReturnFocus.ts` | verbatim | `08ff63b` |
| `src/ui/styles/base.css` | verbatim | `08ff63b` |
| `src/ui/styles/zones.css` | adapted | `08ff63b` |
| `src/ui/test/axe.ts` | verbatim | `08ff63b` |
| `src/ui/test/setup.ts` | verbatim | `08ff63b` |
| `src/ui/test/stories.a11y.test.tsx` | verbatim | `08ff63b` |
| `src/ui/test/stories.test.ts` | verbatim | `6a8ffcf` |
| `src/ui/theme/ThemeProvider.tsx` | verbatim | `08ff63b` |
| `src/ui/theme/ThemeToggle.tsx` | verbatim | `f57d4dc` |
| `src/ui/theme/index.ts` | verbatim | `08ff63b` |
| `src/ui/theme/server.ts` | verbatim | `08ff63b` |
| `src/ui/theme/themes.test.ts` | adapted | `08ff63b` |
| `src/ui/theme/themes.ts` | adapted | `08ff63b` |
| `src/ui/tokens/README.md` | verbatim | `08ff63b` |
| `src/ui/tokens/color.ts` | verbatim | `08ff63b` |
| `src/ui/tokens/contrast.test.ts` | verbatim | `08ff63b` |
| `src/ui/tokens/index.ts` | verbatim | `2005ad0` |
| `src/ui/tokens/primitives.ts` | verbatim | `79541bc` |
| `src/ui/tokens/scale.ts` | verbatim | `2005ad0` |
| `src/ui/tokens/semantic.ts` | verbatim | `79541bc` |

## i18n formatters and status presentation

| Path | Mode | Source commit |
|---|---|---|
| `src/domain/status/index.ts` | adapted | `f57d4dc` |
| `src/domain/status/status.test.ts` | adapted | `f57d4dc` |
| `src/i18n/format.test.ts` | verbatim | `2005ad0` |
| `src/i18n/format.ts` | verbatim | `2005ad0` |

## App, scripts, lint rules, Storybook

| Path | Mode | Source commit |
|---|---|---|
| `.storybook/fonts.css` | verbatim | `2005ad0` |
| `.storybook/main.ts` | adapted | `08ff63b` |
| `.storybook/preview.css` | verbatim | `08ff63b` |
| `.storybook/preview.tsx` | adapted | `08ff63b` |
| `eslint-rules/no-money-arithmetic.mjs` | verbatim | `08ff63b` |
| `eslint-rules/no-money-arithmetic.test.ts` | verbatim | `08ff63b` |
| `scripts/build-icons.ts` | verbatim | `f57d4dc` |
| `scripts/build-tokens.ts` | verbatim | `2005ad0` |
| `scripts/check-contrast.ts` | verbatim | `79541bc` |
| `scripts/copy-fonts.ts` | verbatim | `2005ad0` |
| `scripts/gen-api.ts` | adapted | `08ff63b` |
| `scripts/lhci.ts` | adapted | `f57d4dc` |
| `scripts/release-hygiene.ts` | adapted | `08ff63b` |
| `src/app/global-error.tsx` | verbatim | `08ff63b` |

## Brand files (the founder's logo, getproperty-web `pnpm brand` output)

Byte-for-byte copies. The manifest icons of this app are getproperty-web's staff PWA icons (the same artwork —
the founder's app icon, white house on the house blue; maskable with the mark inside the 80 % safe circle), kept
under this app's names (`copy ← source`). Not from getproperty-web: `docs/brand/line/` (the LINE MINI App channel
icon) and the logo block of `public/offline.html` — both written by this app's `pnpm brand` from the files below.

| Path | Mode | Source commit |
|---|---|---|
| `docs/brand/getproperty-app-icon.svg` | binary | `79541bc` |
| `docs/brand/getproperty-logo-source.png` | binary | `79541bc` |
| `docs/brand/getproperty-logo-white.svg` | binary | `79541bc` |
| `docs/brand/getproperty-logo.svg` | binary | `79541bc` |
| `docs/brand/getproperty-mark-white.svg` | binary | `79541bc` |
| `docs/brand/getproperty-mark.svg` | binary | `79541bc` |
| `docs/brand/logo-preview.png` | binary | `79541bc` |
| `public/brand/apple-touch-icon.png` | binary | `79541bc` |
| `public/brand/favicon-16.png` | binary | `79541bc` |
| `public/brand/favicon-32.png` | binary | `79541bc` |
| `public/brand/favicon-48.png` | binary | `79541bc` |
| `public/brand/favicon.svg` | binary | `79541bc` |
| `public/brand/getproperty-app-icon.svg` | binary | `79541bc` |
| `public/brand/getproperty-logo-white.png` | binary | `79541bc` |
| `public/brand/getproperty-logo-white.svg` | binary | `79541bc` |
| `public/brand/getproperty-logo.png` | binary | `79541bc` |
| `public/brand/getproperty-logo.svg` | binary | `79541bc` |
| `public/brand/getproperty-mark-white.svg` | binary | `79541bc` |
| `public/brand/getproperty-mark.svg` | binary | `79541bc` |
| `public/favicon.ico` | binary | `79541bc` |
| `public/icons/apple-touch-icon.png` ← `public/brand/apple-touch-icon.png` | binary | `79541bc` |
| `public/icons/icon-192.png` ← `public/pwa/staff-192.png` | binary | `79541bc` |
| `public/icons/icon-512.png` ← `public/pwa/staff-512.png` | binary | `79541bc` |
| `public/icons/maskable-512.png` ← `public/pwa/staff-maskable-512.png` | binary | `79541bc` |

## Reference docs

| Path | Mode | Source commit |
|---|---|---|
| `docs/prompts/design-system.md` | verbatim | `2005ad0` |
| `docs/ui/brand.md` | verbatim | `79541bc` |
| `docs/ui/voice-and-tone.md` | verbatim | `08ff63b` |
