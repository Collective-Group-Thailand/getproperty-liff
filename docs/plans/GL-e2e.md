# GL-e2e — run the deferred G e2e (sandbox main at GL4 `41c0bc4`)

Not a feature step. e2e was skipped in GL1, GL2, GL4 and partly in GL3 (founder stop, 2026-10-28); this step runs the
whole Playwright suite (`CI=1 pnpm e2e`, mock build, under the shared heavy lock) and fixes what fails.

## Plan
1. Full run → list failures and flaky tests (fail then pass on retry).
2. For each failure fix the cause, never the assertion's strength: the spec (selectors, scroll steps for parts that load
   near the screen, waiting for hydration) or a real UI bug. An API need goes to `docs/contract-requests.md`, not the api.
3. Clear the `shared:check` warnings: re-sync `src/ui/icons` from getproperty-web's **committed** HEAD (`git archive` →
   `SHARED_SOURCE=… pnpm shared:check --strict`, so the concurrent web session's working tree never leaks in): `curated.ts`
   gains `star`, `sparkles`; `pnpm icons` regenerates the glyphs and the registry. GL4's feature-local star SVG
   (`features/resident/reviews/Stars.tsx`) switches to the synced `IconStar`.
4. Re-run the failing specs, then lint · format:check · typecheck · unit · shared:check · build, Lighthouse for the sets
   whose pages changed, one final full e2e run.
5. One commit `test(e2e): run deferred G e2e …`; PROGRESS entry.
