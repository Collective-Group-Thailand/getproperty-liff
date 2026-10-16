# src/lib/bff — L1

`src/app/bff/[...path]/route.ts` answers **501** in L0 (a `problem+json` with code
`bff.not_implemented`). L1 builds `createBffHandler()`:

- upstream allow-list: `/v1/resident/*`, `/v1/auth/resident/*`, and in R2 `/v1/technician/*` +
  `/v1/auth/technician/*` — everything else 404s;
- bearer from the httpOnly cookie, one refresh on `401`, cookie rotation;
- same-origin `Origin` + `x-getproperty-csrf: 1` on non-GET;
- streaming passthrough (receipt PDFs, SSE for payment status), body size limit (slips and
  service-request photos go to object storage by presigned URL, not through the BFF);
- no caching of authenticated responses.
