# src/lib/observability

- Sentry — server (`src/instrumentation.ts`, `onRequestError`) and browser (`src/instrumentation-client.ts`, loaded
  lazily and only with `NEXT_PUBLIC_SENTRY_DSN`); every event goes through `scrub.ts` (no cookies, auth headers,
  bodies, query strings or user).
- OpenTelemetry — `@vercel/otel` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set: server fetch spans with the trace
  context propagated to getproperty-api only.
- Web Vitals RUM — `rum.ts` builds the payload in the browser (route with ids replaced, LIFF context: in LINE or
  not, OS); `/bff/rum` checks it (`rumSchema.ts`) and logs `{"type":"rum",…}`. Never the id token or LINE profile.
- `liffContext.ts` — the LIFF context the entry stores for the visit (sessionStorage).
- Request ids — the proxy assigns `x-request-id`; the BFF forwards it; error states show the API's request id.
