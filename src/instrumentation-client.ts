/**
 * Browser error reporting (L1 1.3 §5): Sentry only when a DSN is configured, loaded lazily so a deployment without
 * one ships none of the SDK (the initial-JS budget), and scrubbed — no cookies, query strings, bodies or user. Its
 * ingest origin is added to the CSP `connect-src` by the proxy.
 *
 * The DSN and the environment are run-time values (D-230: one image for every environment): the root layout renders
 * them from the server's environment onto `<html data-sentry-dsn data-env>`.
 */
import { publicConfig } from "@/lib/publicConfig";

const { sentryDsn: dsn, env } = publicConfig();

if (dsn) {
  void Promise.all([import("@sentry/nextjs"), import("@/lib/observability/scrub")]).then(([Sentry, { scrubEvent }]) => {
    Sentry.init({
      dsn,
      environment: env || "production",
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => {
        if (crumb.data && typeof crumb.data.url === "string") crumb.data.url = crumb.data.url.split(/[?#]/)[0];
        return crumb;
      },
    });
  });
}
