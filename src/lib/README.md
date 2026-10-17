# src/lib

Platform code for the one zone: `liff/` (mockable wrapper, entry flow, deep links, fake LINE id tokens),
`api/` (generated types, typed clients, problems, query defaults, upstream/mocks), `auth/` (cookies, refresh,
actor, guards), `bff/` (the BFF handler), `security/` (CSP with nonce + headers), `observability/` (Sentry,
OTel, RUM), `pwa/` (manifest, service worker policy, push), `realtime/` (event → query mapping), `env.ts`
(zod-validated environment) and `flags.ts`. Each folder's README says what lives there.
