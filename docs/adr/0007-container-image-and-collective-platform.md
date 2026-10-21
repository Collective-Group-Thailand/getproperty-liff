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
- **Public configuration is build-time.** `NEXT_PUBLIC_*` (LIFF id, LINE OA id, asset origin = the product's S3
  bucket, VAPID key, Sentry DSN, env badge) are inlined by Next, server code included, so `.github/workflows/deploy.yml`
  builds one image per environment (main → `:uat`, tag `vX.Y.Z` → `:prod`) from repository variables and refuses to
  build without a LIFF id. Server values (`API_INTERNAL_URL`, `APP_ORIGIN`, `SENTRY_DSN`, `FEATURE_TECHNICIAN`, …)
  come from the box's `/run/collective/getproperty-liff.env` at run time.

## Consequences
- The image differs per environment: collective-infra's `promote.yml` (re-tag uat → prod without a rebuild) must
  not promote `getproperty/liff` — production gets its own build from the release tag. Moving the public values to
  run time (a server-rendered config read by the client) would make one image serve both; it costs initial JS on
  `/profile`, which has 0.1 KB of headroom (`docs/performance-budgets.md`), and is left for after R1.
- `next start` still serves the same standalone build for e2e, Lighthouse and the integration project; its warning
  that it "does not work with output: standalone" is expected (the image runs `node server.js`).
