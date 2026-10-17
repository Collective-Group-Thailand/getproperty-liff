/**
 * Browser error reporting (L1 1.3 §5): Sentry only when `NEXT_PUBLIC_SENTRY_DSN` is set at build time, loaded
 * lazily so a build without it ships none of the SDK (the 150 KB initial-JS budget), and scrubbed — no cookies,
 * query strings, bodies or user. Its ingest origin is added to the CSP `connect-src` by the proxy.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void Promise.all([import("@sentry/nextjs"), import("@/lib/observability/scrub")]).then(([Sentry, { scrubEvent }]) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_ENV_BADGE || "production",
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => {
        if (crumb.data && typeof crumb.data.url === "string") crumb.data.url = crumb.data.url.split(/[?#]/)[0];
        return crumb;
      },
    });
  });
}
