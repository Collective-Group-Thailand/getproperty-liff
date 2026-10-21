# ADR-0007 — Container image on the Collective platform

**Status:** Accepted (2026-10-21, pre-release) · implements D-230 (and D-229 for the client address); the platform
side is getproperty-api `docs/deployment.md` and collective-infra branch `getproperty/r1-platform`

## Context
D-230 moves getproperty from its own cloud plan to Collective's shared AWS platform ("Config C", the one getpack
uses): one EC2 box per environment (`ap-southeast-7`), docker compose, Caddy 2.10 as the only proxy, Grafana Alloy
scraping containers labelled `collective.metrics`, deploys from GitHub Actions (OIDC → ECR → SSM
`deploy-product.sh`: pull · up · health · rollback). The platform's compose file runs this app as
`getproperty-liff` (256 MB limit) and expects an image that answers `/api/healthz` on `:3000`.

## Decision
- **One standalone Next.js image** (`Dockerfile`, `output: "standalone"`): `node:24-bookworm-slim`, built natively
  for `linux/arm64` by collective-infra's `reusable-build-push.yml`; tini as PID 1, the `node` user, `wget` for the
  platform's healthcheck, `tzdata` + `TZ=Asia/Bangkok` (dates are rendered in Asia/Bangkok explicitly anyway). The
  build stage runs `pnpm build && pnpm release:hygiene`, so an image with the fake LIFF or the mock API cannot exist
  (the hygiene check also refuses development-only packages in the standalone `node_modules`).
- **Memory.** The compose limit is 256 MB. Under a 256 MB memory cgroup with 12 concurrent page renders the live heap
  stayed at 55–75 MB; with V8's default sizing the container peaked at 206 MB (and one cold run was OOM-killed),
  with `NODE_OPTIONS=--max-old-space-size=128` (set in the image) at ~178 MB. Watch
  `container_memory_working_set_bytes{name="getproperty-liff"}` after the first UAT week; raise the limit to 384 MB
  (as for web) rather than the heap if it approaches the limit.
- **`GET /api/healthz`** — liveness only (`{"status":"ok"}`, `no-store`). It does not call getproperty-api: an API
  outage must not make the platform restart or roll back the resident app (the API has its own `/health`).
- **`GET /api/metrics`** — Prometheus text (Node.js runtime metrics, label `service` = `OTEL_SERVICE_NAME`, the same
  families as the API; nothing per request, user or URL) for callers in `METRICS_ALLOWED_CIDRS` (default loopback +
  private ranges = Alloy on the docker network). Next fills `X-Forwarded-For` with the socket's peer only when the
  request has none, so a scrape on the docker network passes and anything through Caddy (which writes the internet
  client's address) gets 404; Caddy also answers `/api/metrics` 404 on the public host. Both routes are server-only
  route handlers outside the page proxy (`src/proxy.ts` matcher) — no client JavaScript changes.
- **Client address** (D-229): Caddy replaces an internet client's `X-Forwarded-For` with that client's address, so
  the container sees exactly one hop: `TRUSTED_HOPS=1` (set by the platform compose file). The BFF reaches the API
  at `API_INTERNAL_URL=http://getproperty-api:3000` over the docker network.
- **One image for every environment** (amended 2026-10-21, as getproperty-web `54e02c9`): no value is compiled in.
  The public settings keep their `NEXT_PUBLIC_*` names (`NEXT_PUBLIC_LIFF_ID`, `NEXT_PUBLIC_LINE_OA_ID`,
  `NEXT_PUBLIC_ASSET_BASE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_ENV_BADGE`) but
  are read **on the server at run time** with every other value (`serverEnv()`, `src/lib/env.ts`, from the box's
  `/run/collective/getproperty-liff.env` = the secret `collective/<env>/getproperty/liff`). The browser gets what it
  needs from the server-rendered root element — `<html data-liff-id data-sentry-dsn data-env>`
  (`src/lib/publicConfig.ts`): the LIFF SDK's `liff.init({ liffId })`, "open in LINE" links built in the browser
  and Sentry's DSN and environment; the VAPID key is a prop of the server-rendered pages that offer push; the asset
  origin is only used by the proxy's CSP. `src/lib/runtime-env.test.ts` fails on any literal
  `process.env.NEXT_PUBLIC_…` read (Next would inline it) except `NEXT_PUBLIC_LIFF_MOCK`, the **build flavour** (mock
  builds for e2e / Storybook / Lighthouse; never set for the platform image, `release:hygiene` refuses the fake LIFF
  and the mock API in a build). A production server without `NEXT_PUBLIC_LIFF_ID` fails its start-up check (the instrumentation hook
  throws) and answers every request, `/api/healthz` included, with 500 — so a deploy that forgot it fails its health
  check and rolls back. Cost: none on the budget — `<html>` attributes are markup; the
  reader is a few bytes and replaces the inlined values (`docs/performance-budgets.md`, "Founder's logo + run-time public settings": `/profile` 184 272 B, 2 below before).
- **Deploys** (`.github/workflows/deploy.yml`, as getproperty-web's): one build per commit (main → `:sha-…` + `:uat`
  → UAT; tag `vX.Y.Z` → `:prod` → production), no build arguments, no repository variables; collective-infra's
  `promote.yml --component liff` may instead ship the image UAT ran to production. CI's `image` job starts the one
  image with two LIFF ids and checks each container serves its own, and that neither is in the client chunks.

## Consequences
- The UAT image can be promoted to production like getproperty-web's (collective-infra `promote.yml`); the values
  that differ per environment live only in the platform secrets (collective-infra README, getproperty-api
  `docs/deployment.md` §3). Changing the LIFF id or the env badge is a secret change plus a restart, not a rebuild.
- (Superseded) Until 2026-10-21 the public values were inlined and each environment built its own image from
  repository variables `UAT_*` / `PROD_*`; those variables are no longer read and can be deleted.
- `next start` still serves the same standalone build for e2e, Lighthouse and the integration project; its warning
  that it "does not work with output: standalone" is expected (the image runs `node server.js`).
