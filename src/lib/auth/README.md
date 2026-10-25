# src/lib/auth (ADR-0006)

- `cookies.ts` — session cookie names (`__Host-gp_at`/`__Host-gp_rt`, technicians `__Host-gp_tat`/`__Host-gp_trt`, prospects `__Host-gp_pat`/`__Host-gp_prt` — L5, D-281),
  flags, parsing, reading (never verifying) the access token's `exp`/`aud`.
- `refresh.ts` — `POST /v1/auth/refresh`, single-flight per refresh token, process-wide.
- `renew.ts` — renewal before rendering (used by `src/proxy.ts`).
- `actor.ts` — `getActor()` / `getTechnician()` / `getProspect()`: `/v1/resident/me` / `/v1/technician/me` /
  `/v1/prospect/me` once per request; `requireProspect` guards my enquiries (`/rent/enquiries…`).
- `guards.ts`, `redirects.ts` — signed out → `/liff?liff.state=…` in LINE's browser, `/auth?next=…` elsewhere;
  consent missing → `/consent?next=…`; every target through `safeInternalPath`.
- `client.ts` — browser: `exchangeLineIdToken()` (the id token goes into one request body, nowhere else),
  `signOut()`; `afterSignIn.ts` — language from `/me` wins, consent before the target.
- `entitlements.ts` — menus from `/me.entitlements` (`ResidentMeDto.entitlements`, D-181).
- `rescope.ts` — a unit or lease in `/me` that the token's scopes do not cover yet (a phone match the Owner confirmed,
  D-226; a move-in since the last refresh): `requireResident` sends the page once through `GET /auth/rescope?next=…`
  (`src/app/(liff)/auth/rescope/route.ts`), which rotates the resident session and redirects back; the `gp_rescoped`
  marker (30 s) prevents a loop.
