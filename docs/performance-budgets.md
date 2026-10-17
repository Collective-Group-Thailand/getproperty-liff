# Performance budgets (design-system.md §7)

Enforced with Lighthouse CI (`pnpm lhci`, configs in `lighthouse/`, built with `NEXT_PUBLIC_LIFF_MOCK=1`)
and, from L1, Web Vitals RUM posted through the BFF. On a shared CI runner LCP/INP/CLS are **warnings**
(a lab run is not a p75); the initial JS size and the accessibility score are **errors**.

| Route type | LCP (p75) | INP (p75) | CLS | JS shipped (gz, initial) | Lighthouse set |
|---|---|---|---|---|---|
| Resident LIFF pages | ≤ 2.0 s on 4G mid-range inside LINE | ≤ 200 ms | ≤ 0.05 | ≤ 150 KB | `resident` |
| Technician pages (R2) | ≤ 2.5 s on 4G mid-range | ≤ 200 ms | ≤ 0.1 | ≤ 180 KB | `technician` (L4) |

`resource-summary:script:size` is asserted as the budget in bytes (150 KB → 153 600). The reference device
is a 360 × 780 Android phone (Lighthouse mobile preset, 4× CPU slowdown, 1.6 Mbps).

Techniques: RSC by default, client components only where interactive (the LIFF entry, the pay sheet),
the LIFF SDK loaded by dynamic import only where LIFF is used, self-hosted Thai-first fonts (two
preloaded), `next/image` with `sizes` for meter photos, no layout shift from fonts or images.

## Sets
`resident` (`/`, `/link` — signed in through the mock API's seed refresh token sent as a cookie) and `public`
(`/liff`, `/auth`, `/auth/otp`, `/signed-out`). `pnpm lhci` starts a production server on 3400 against a
`NEXT_PUBLIC_LIFF_MOCK=1` build with `API_MOCKS=1`; as root it adds `--no-sandbox` to Chrome. CI job `lighthouse`.

## L1 status (2026-10-17, measured here with Chromium 141)
Accessibility 1.0 on every page; LCP 2.2–3.8 s under the simulated 4× CPU / 1.6 Mbps profile (warning);
**initial JS 193–209 KB gz (`resource-summary`) against the 150 KB budget — failing; CLS 0.** Of that, the framework alone (React 19
`react-dom` ≈ 74 KB, the Next 16 runtime ≈ 57 KB) is ≈ 130 KB; the rest is next-intl's message runtime
(≈ 12 KB), the design system's icon registry (lucide, ≈ 17 KB — every icon in one module), TanStack Query
(≈ 8 KB), Radix Slot + CVA (≈ 8 KB) and app code. L1 already keeps zod out of the browser, loads the settings and
unit sheets (Radix Dialog) on first open and sonner on first interaction. Closing the gap needs a decision
(docs/PROGRESS.md, deferred): per-icon imports in getproperty-web's registry, precompiled messages, or a budget
that reflects the framework baseline.
