<!-- copied from getproperty-web@79541bc until collective-shared exists (D-155) — adapted: subset note, resident brand files -->

# src/ui — the getproperty design system

**A copy.** Every file here comes from `getproperty-web/src/ui` (manifest: `docs/shared-copies.md`,
check: `pnpm shared:check`) and only the components a resident app needs are present. Change the
source there first, then re-copy; adaptations are marked in the file header (D-155).

Standards: `docs/prompts/design-system.md`. Decisions: ADR-0001 (fonts), ADR-0002 (Radix + Tailwind v4

- CVA), ADR-0003 (tokens → generated CSS variables, three themes, `gp_theme` cookie).

```
tokens/      primitives → semantic → (component tier lives in each component's cva)
generated/   tokens.css — `pnpm tokens`; never edit
styles/      base.css (element defaults, focus ring, reduced motion), zones.css (resident density + safe areas)
fonts/       the five woff2 files + next/font/local declarations
brand/       BRAND_* constants, the founder's logo as Mark / Wordmark (geometry.ts generated in getproperty-web, copied)
icons/       the curated ICONS registry and <Icon>
components/  one file per component, Storybook story + axe test beside it
theme/       ThemeProvider / ThemeToggle / server stamp
docs/        Storybook MDX: principles, tokens, voice & tone
test/        axe helper for component tests
```

Rules: semantic utilities only (`bg-surface`, `text-muted`, `rounded-control`); copy comes in as props;
status tone/icon from `src/domain/status`; every component ships a story and passes axe in `pnpm test`.

Brand (docs/ui/brand.md): the logo is the founder's artwork (`docs/brand/*.svg`), never re-drawn and never
re-set in a font. `<Wordmark size="sm|md|lg" />` (height 28 / 36 / 56 px) is the full logo, `compact` or `<Mark />`
the house only; `tone="onDark"` is the founder's white version for brand-blue backgrounds (the `auto` tone already
turns white in the dark theme through the `logo-*` tokens); `decorative` hides it when visible text or the enclosing
link names it, otherwise it is an image named "getproperty". Both are server components with no client state:
render them in a server component and pass them to a client component as a prop, so the path data is markup, not
JavaScript (the resident shell and the sign-in screens do; D-179). Static files (favicons, app icons, PNG logos)
are byte-for-byte copies of getproperty-web's `pnpm brand` output (`public/brand/`, `public/icons/`, `public/favicon.ico`);
`pnpm brand` here only writes what is this app's own — the LINE MINI App channel icon and the offline page's logo.
