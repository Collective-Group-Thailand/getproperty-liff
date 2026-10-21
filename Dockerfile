# syntax=docker/dockerfile:1.7
# getproperty-liff — the resident LINE Mini App as one container (D-230, ADR-0007). Built natively for linux/arm64 by
# collective-infra's reusable-build-push.yml (.github/workflows/deploy.yml) and run by the platform's
# products/getproperty/docker-compose.yml as `getproperty-liff`: :3000, GET /api/healthz (liveness), GET /api/metrics
# (Prometheus, docker network only), TZ=Asia/Bangkok. Pattern: collective-infra platform/products/getpack/Dockerfile.web.example.
#
#   docker build --build-arg NEXT_PUBLIC_LIFF_ID=… -t getproperty/liff .
#   docker run --rm -p 3300:3000 -e API_INTERNAL_URL=http://host.docker.internal:3000 getproperty/liff
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: the only postinstall is `pnpm fonts`, and the font files are committed (CI checks them); esbuild
# and the other native tools resolve their prebuilt linux-arm64 packages without install scripts.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
# NEXT_PUBLIC_* are inlined at build time (server and browser code alike), so each environment builds its own image
# with its own values (deploy.yml); build arguments are in the environment of the RUN below. NEXT_PUBLIC_LIFF_MOCK is
# deliberately not an argument: a production image never contains the fake LIFF or the mock API, and
# `release:hygiene` below fails the build if it did.
ARG NEXT_PUBLIC_LIFF_ID
ARG NEXT_PUBLIC_LINE_OA_ID
ARG NEXT_PUBLIC_ASSET_BASE_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_ENV_BADGE
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm build && pnpm release:hygiene

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Asia/Bangkok
# The platform limits this container to 256 MB (compose `liff`). Measured under a 256 MB cgroup with 12 concurrent page
# renders: live heap 55–75 MB; V8's default sizing let the process peak at 206 MB, a 128 MB old space at ~178 MB.
ENV NODE_OPTIONS=--max-old-space-size=128
# tini (PID 1, signals), wget (the platform's healthcheck), tzdata (TZ), CA certificates (OTLP / Sentry over TLS)
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini wget ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/healthz >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
