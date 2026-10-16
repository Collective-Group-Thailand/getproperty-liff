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

## L0 status
`pnpm lhci` is configured for `/` and `/liff`; it needs Chrome and a mock build and is not part of
`pnpm test`. The CI job is added in L1.
