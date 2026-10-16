# src/lib/auth — L1

LIFF id-token exchange: `liff.getIDToken()` → `POST /bff/auth/line` → `/v1/auth/resident/line` → the
server sets `__Host-gp_at` / `__Host-gp_rt` (httpOnly, `Secure`, `SameSite=Lax`); the id token is never
stored in JS, localStorage or a JS-readable cookie. Fallback outside LINE: SMS magic link
(`/v1/auth/resident/magic-link`) → same cookies. Technicians (R2) use the same flow with audience
`technician`. `getActor()` reads `/v1/resident/me` (units/occupancies, language, consents, entitlements),
cached per request; route guards in the layout. Nothing in L0.
