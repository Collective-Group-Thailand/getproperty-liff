# src/lib/bff (ADR-0006)

`createBffHandler()` (`handler.ts`, served at `src/app/bff/[...path]/route.ts`):

- allow-list `/v1/resident/*`, `/v1/auth/resident/*` (+ `/v1/technician/*`, `/v1/auth/technician/*` with
  `FEATURE_TECHNICIAN=1`); encoded separators and dot segments refused; everything else 404 `bff.not_allowed`;
- `/bff/auth/line`, `/bff/auth/technician/line` — id token → token pair → `__Host-` httpOnly cookies; the
  browser gets the subject only; `/bff/auth/logout` ends every session of the browser;
- bearer from the cookie, renewed before the call when stale and **once** on a 401, rotated cookies always
  written back (single-flight per refresh token, `src/lib/auth/refresh.ts`);
- same-origin + `x-getproperty-csrf: 1` on every non-GET (403 `bff.csrf`); 256 KB body cap (413
  `bff.payload_too_large` — photos and slips go to object storage by presigned URL);
- responses streamed through (receipt PDFs, SSE) with `cache-control: no-store`; 502 `bff.upstream_unavailable`.

`src/app/bff/rum/route.ts` takes Web Vitals beacons (same-origin, schema-checked, logged as one JSON line).
