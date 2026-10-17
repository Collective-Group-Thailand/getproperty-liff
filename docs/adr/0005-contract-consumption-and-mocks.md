# ADR-0005 — Contract consumption & mocks

**Status:** Accepted (2026-10-17, L1) · applies contract §1–§3 (`docs/contract/api-conventions.md`) to this app

## Context
`getproperty-api` owns the contract (`contract/openapi.json`, generated from its NestJS code, D-002). This app
must render exactly what the API returns — money as decimal strings, problems with `legalRef` — and must be
buildable and testable without the API running, inside LINE's constraints and on CI runners that have no
sibling checkout. Some endpoints this app needs are not in the contract yet (the API's resident surface is
landing in slices).

## Decision
- **Vendored, pinned contract.** `pnpm gen:api --adopt` copies `API_CONTRACT_SOURCE` (default
  `../getproperty-api/contract/openapi.json`) to `contract/openapi.json` and writes `contract.lock.json`
  (`version`, `sha256`, the API's `sourceCommit`). Bumping is a reviewable PR; nothing fetches at build time.
- **Generated, committed, checked.** `pnpm gen:api` writes `src/lib/api/schema.d.ts` (openapi-typescript — the
  only source of API types), `src/lib/api/operations.generated.ts` (the operations this app may call and which
  need an `Idempotency-Key`) and `mocks/generated/operations.ts` (each operation's success example and every
  documented problem with its example body). Only `/v1/resident/*`, `/v1/technician/*`,
  `/v1/auth/{resident,technician}/*` and the BFF's `/v1/auth/{refresh,logout}` are emitted into the tables.
  `pnpm gen:api --check` (CI `contract` and `verify` jobs) fails on any drift or hand edit.
- **Typed clients.** `serverApi()` (Server Components, `API_INTERNAL_URL`, bearer from the cookie) and
  `browserApi` (`/bff`, CSRF header, automatic `Idempotency-Key` for flagged operations) are openapi-fetch
  clients over `paths`; non-2xx answers become `ApiError` (`code`, `detail`, `legalRef`, field `errors`,
  `requestId`). TanStack Query defaults and a query-key factory live in `src/lib/api/query.ts`.
- **Mocks in-process, server-side.** In a mock build (`NEXT_PUBLIC_LIFF_MOCK=1`) with `API_MOCKS=1`, every
  server-side API call (BFF, `serverApi()`, the proxy's refresh) is answered by MSW's `getResponse()` against the
  handlers in `mocks/` — no service worker, no patched `fetch`, nothing in the browser. Handlers answer with the
  generated examples; flows that need state (sign-in, refresh rotation with reuse detection, consents, OTP
  attempts) keep it in one process-wide store. `x-gp-mock` (from the `gp_mock` cookie) forces any documented
  problem, so every error path is reachable from e2e. The branch is inlined on `NEXT_PUBLIC_LIFF_MOCK`, so a
  production build drops it (`pnpm release:hygiene` checks the server bundle too).
- **Missing endpoints are requests, not inventions.** What the contract lacks goes to
  `docs/contract-requests.md` and to `mocks/contract-requests.ts`, each handler and call site marked
  `// CONTRACT-REQUEST`, reusing problem codes the contract already documents. They are deleted when the API
  ships the operation.
- **Enums by contract name.** Status maps are typed `ContractEnum<"InvoiceStatus", fallback>`: the schema-design
  values until the contract publishes the enum, the generated type afterwards — then a value without a label,
  tone and icon fails the build.

## Consequences
- The app is fully exercisable (`pnpm dev:mock`, e2e, Lighthouse) without LINE or the API; the `integration`
  Playwright project runs the same pages against the real API.
- Mock data can never drift silently from the contract's shapes; it can lag behaviour the contract does not
  describe (documented per scenario in `mocks/state.ts`).
