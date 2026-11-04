# JRL — Units, roles and the co-owner home (plan + record)

Step JRL of `docs/prompts/J-juristic-liff.md` (pack J, D-309 = D-J08, D-322), after api JR (`c66e284`). Branch
`feat/JRL-units-roles` from `main` `19d1d58`. e2e specs are written, not run (founder 2026-10-28).

## Contract
`API_CONTRACT_REF=c66e28496909325349e53410f0bec5dfca8b07de pnpm gen:api --adopt` — lock `sourceCommit` = the full SHA.
New operations used: `resident.units.list` (`GET /v1/resident/me/units`), `resident.units.usage`
(`GET /v1/resident/units/{unitId}/usage`), `resident.unitInvitations.preview|requestOtp|accept`; `unitId` on
`GET /v1/resident/invoices`; `unitRoles` on `/me` (not needed by the UI: `/me/units` carries the same per unit).

## What changes and why
`/v1/resident/me` `units` still lists **occupancies only**: a co-owner who does not live in the unit has none, so
today the app shows them "no unit yet". The unit list therefore comes from `/me/units` from now on.

1. **Actor** (`src/lib/auth/actor.ts`): `/me` and `/me/units` in parallel (one request each per render, `cache`).
   `units` = `/me/units` (each with `validFrom` = my occupancy start, else the earliest role start); a failure of
   `/me/units` falls back to `/me` units with every capability (the API still enforces, never more than before).
   `unit` = the `gp_unit` choice when still mine, else the first. `entitlements` = the account's entitlements ∩ the
   current unit's capabilities (the API: "the tenant's modules still gate the tiles"); `capabilities` and
   `refreshRequired` are exposed too.
2. **Model** (`src/features/resident/units/model.ts`, pure, unit-tested): capability → menu mapping
   (`invoices` → bills + receipts, `usage`, `service_requests`, `notices` → announcements, `parcels`,
   `facilities`, `access`, `lease`; `rules` / `contacts` need only the capability), home kind
   (`resident` = a tenant / co-tenant / payer role → today's home; `owner` = co-owner without those; `household` =
   family only), the role word shown per unit (co-owner › tenant › co-tenant › payer › family).
3. **Refresh**: `refreshRequired` → the guard rotates the session once through `/auth/rescope` (the same path as
   D-226's scope gap, marker cookie, never a loop); the switcher refreshes before switching when the list said so.
4. **Switcher**: the top bar keeps *the unit I am looking at* (unit + building); the sheet is "ทุกห้องของฉัน (n)"
   with a row per unit: unit, building · operator, role word. The choice is remembered in the `gp_unit` cookie
   (server) **and** `localStorage` (try/catch; restores the cookie when LINE's browser dropped it).
5. **Home by role**: `resident` unchanged; `owner` = common fees due for this unit (the hero, "ค่าส่วนกลาง"),
   latest notices, documents (receipts, documents to sign); `household` = latest notices and parcels waiting.
   Visitors stay hidden until JL4 (no placeholder). Lease-bound rows (lease tile, renewal offers) only with the
   `lease` capability and a lease of that unit.
6. **Screens**: rules / contacts by unit capability (no lease needed); usage via `/units/{unitId}/usage`
   (404 → not found; no capability → not found; no IoT entitlement → "read by hand" as today); invoices list gets a
   unit filter (all my units by default — a debt is never hidden behind the switcher — or one unit, `?unit=` →
   `unitId`); requests/new picks units from the unit list.
7. **Redeem** (`/link/unit?code=` — the API's invite URL; `/join/{code}` redirects there): preview card (operator,
   building, unit, masked name, phone the code goes to, valid until) → required consents (the guard; a 409
   `consent.required` at accept goes through `/consent?next=` and back) → *send the code* (`…/otp`) → six digits with
   the resend countdown and attempts left → `…/accept` (Idempotency-Key per code + challenge) → refresh the session →
   success → the unit's home (`gp_unit` = the new unit). Every error designed: not found, not pending (used /
   revoked / expired), party mismatch, phone missing, consent required, wrong code (attempts), expired code, too many
   attempts, rate limited, and the generic problem with request id. State machine in `units/redeem.ts`.
8. **Mocks**: `mocks/units.ts` — `/me/units` from the account (occupancy roles, lease roles, ownerships),
   `unitsHash`, `refreshRequired` vs the session's scopes; unit usage (occupancy only); invitations
   (`mock-unit-…` codes: `ok`, `used`, `mismatch`, `nophone`, else 404; OTP `123456`, `000000` expired, 5 tries);
   invoices `unitId` filter; scenario words `coowner` (owns C-1203 in a juristic condo, a common-fee bill),
   `family` (lives in A-201 as family, no lease, no bills).
9. **i18n**: every new string in th, en, my, km, lo, zh (my/km/lo/zh drafts).

## Tests
- Vitest: role → navigation mapping and home kind; unit choice persistence (cookie + storage, storage throwing);
  redeem state machine and error mapping; mocks (`/me/units` per scenario, refreshRequired after an accepted invite,
  invitation errors, unit usage 404 for a co-owner); actor fallback.
- Playwright (written, not run): `e2e/units-roles.spec.ts` — co-owner home and nav, family home and nav, redeem
  happy path + wrong code + used code, switcher remembers the unit.
- Storybook: unit sheet with roles, redeem steps.

## Gates
lint · format:check · typecheck · unit · shared:check · gen:api --check · build · build-storybook · lhci (only if it
runs without Playwright browsers).
