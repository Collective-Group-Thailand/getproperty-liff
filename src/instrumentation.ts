import type { Instrumentation } from "next";

/**
 * Server start-up (Next instrumentation hook):
 * 1. validates the environment (and the `/api/metrics` CIDR allow-list) — a misconfigured deployment fails here, not
 *    on the first resident;
 * 2. OpenTelemetry (`@vercel/otel`) when `OTEL_EXPORTER_OTLP_ENDPOINT` is set: server `fetch` spans, with the
 *    W3C trace context propagated to getproperty-api only;
 * 3. Sentry when `SENTRY_DSN` is set, scrubbed (`scrubEvent`), on top of OTel when both are on.
 */
export async function register(): Promise<void> {
  const { serverEnv } = await import("@/lib/env");
  const env = serverEnv();
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // An invalid `/api/metrics` allow-list stops the start like any other invalid variable.
  const { parseCidrList, PRIVATE_RANGES } = await import("@/lib/http/cidr");
  parseCidrList(env.METRICS_ALLOWED_CIDRS || PRIVATE_RANGES);

  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({
      serviceName: env.OTEL_SERVICE_NAME,
      instrumentationConfig: {
        fetch: { propagateContextUrls: env.API_INTERNAL_URL ? [new URL(env.API_INTERNAL_URL).origin] : [] },
      },
    });
  }

  if (env.SENTRY_DSN) {
    const [Sentry, { scrubEvent }] = await Promise.all([import("@sentry/nextjs"), import("@/lib/observability/scrub")]);
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT,
      release: env.SENTRY_RELEASE,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
      // With @vercel/otel registered, Sentry must not install a second tracer provider.
      enableOpenTelemetrySetup: !env.OTEL_EXPORTER_OTLP_ENDPOINT,
      beforeSend: (event) => scrubEvent(event),
      beforeSendTransaction: (event) => scrubEvent(event),
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
