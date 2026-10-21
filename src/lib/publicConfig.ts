/**
 * The run-time public settings, as the browser sees them (D-230: one image for every environment).
 *
 * The root layout (`src/app/(liff)/layout.tsx`) renders them on the server from `serverEnv()` onto the root element —
 * `<html data-liff-id data-sentry-dsn data-env>` — so the bundle carries no environment value and the image that
 * passed UAT runs in production with production's LIFF id. Browser code reads them here; server code reads
 * `serverEnv()` directly. Values are public by definition (a LIFF id, a Sentry DSN, the environment's name).
 */
export interface PublicConfig {
  liffId?: string;
  sentryDsn?: string;
  env?: string;
}

/** The attribute names on `<html>`, for the layout that writes them. */
export function publicConfigAttributes(config: PublicConfig): Record<`data-${string}`, string | undefined> {
  return { "data-liff-id": config.liffId, "data-sentry-dsn": config.sentryDsn, "data-env": config.env };
}

/** `{}` on the server (no document): server code passes `serverEnv()` values explicitly instead. */
export function publicConfig(): PublicConfig {
  if (typeof document === "undefined") return {};
  const { liffId, sentryDsn, env } = document.documentElement.dataset;
  return { liffId: liffId || undefined, sentryDsn: sentryDsn || undefined, env: env || undefined };
}
