# GL2 — Self-viewing for prospects (plan)

Step GL2 of `docs/prompts/G-growth-liff.md`, after api **G7** (Mac `d69d6c8`, sandbox `addc9f4`; D-295, O-031;
insurance / visitor terms open under O-024). Requirements: D-289 (1), D-295, D-252 / D-281 (prospect viewings),
D-267 (e-KYC), D-070 / D-071 (access credentials), D-072 (work orders), D-179 (page budgets).

## 0. Contract and docs
- `API_CONTRACT_REF=addc9f4… pnpm gen:api --adopt` (never HEAD — G4 commits in parallel), lock `sourceCommit` =
  `d69d6c8326e977ea656ded6c28dc82c7f6f4fc21`, `pnpm gen:api --check`. Fix what the new `mode` / `access` fields
  break (mocks).
- Re-sync `docs/decisions.md` from api `addc9f4` (D-295, O-024 amended, O-031).

## 1. Endpoints used (prospect audience)
`GET /v1/prospect/me/self-viewing` (enabled, identity / phone verified, missing, visitor terms, window minutes),
`POST /v1/prospect/me/phone/otp` + `POST /v1/prospect/me/phone`, `GET /v1/public/listings/{slug}/viewing-slots`
(`mode` per slot, `selfViewing`), `POST /v1/prospect/listings/{slug}/viewings` (`mode: self`, `visitorTermsVersion`),
`GET /v1/prospect/viewings/{id}/access-code` (no-store), `POST …/actions/arrive|leave|report-incident`
(Idempotency-Key, one key per logical action), cancel / reschedule (self stays self).

## 2. Screens (six locales — new namespace `prospect/selfViewing.json`)
- **`/rent/{slug}/self-viewing`** — the booking page. Unavailable state (setting off by default, O-024; or the
  listing offers no self slots) with *book a viewing with the owner* instead. Otherwise four steps: identity (B7.10
  flow at `/rent/verification?next=…`, back here), phone (inline SMS code), a self slot (day chips + time grid, self
  slots only), visitor terms as the API returns them (Thai for Thai, English otherwise; never pre-ticked, the version
  is sent back) + the enquiry consent on first contact. `viewing.requirements_missing` / `viewing.terms_outdated`
  re-read the status and say what changed.
- **Listing page** (book mode): only accompanied slots in the picker; when the listing offers self slots, a card
  *view it on your own* → the booking page.
- **Enquiry page** (`ViewingPanel`): mode badge; reschedule offers only slots of the same mode.
  - accompanied: *who shows you the room* — the owner / agency name from the API and *message them* (the thread).
    The API has no phone / LINE contact for prospects → contract request #35 (nothing hard-coded or mocked).
  - self: the door-code window; requested → waiting for the owner; confirmed → `SelfViewingAccess` (lazy):
    *show the door code* fetched on tap (`cache: "no-store"`, never in TanStack Query, storage or logs), cleared on
    `visibilitychange: hidden`, `pagehide`, unmount and at `validTo`, *hide* button; outside the window the API's
    `codeValidFrom/To` are said plainly; locks with ready state; *I'm inside* (arrive), *I've left and closed the door*
    (leave, confirmation), *report a problem* (sheet, 3–2000 chars, once); closed / no-show / exited states.
- Status map `viewingAccess` (issued, entered, exited, expired, no_show, cancelled) in six locales.

## 3. No caching of the door code
SW: `/bff/*` network-only (unit test for the access-code path); BFF answers `cache-control: no-store`; the client
fetch passes `cache: "no-store"`; the code lives only in component state.

## 4. Mocks, tests, budget
- `mocks/prospect.ts`: slot `mode`; self slots (afternoons) and `selfViewing` only with `gp_mock` `viewing.self=on`
  (off by default like the API); status, phone OTP (code `123456`), access code inside the window, arrive / leave /
  incident, `POST /v1/prospect/__mock/viewings/{id}/confirm` (owner confirms; `{ window: "now" }` opens the code
  window now). Seed refresh `mock-rt.seed-prospect.<sub>`; subject word `selfview` = verified identity + phone and a
  confirmed self viewing open now (Lighthouse).
- Unit: model (window phase, slot modes, terms text, next path), mocks flows, SW policy, status map.
- e2e `self-viewing.spec.ts` — written, not run (founder 2026-10-28).
- Lighthouse set `prospect` (listing, booking page, enquiry with the access panel) ≤ 180 KB — first measured over
  (182.2 / 183.1 / 188.2 KB); checkboxes, the rent-record panel and the write box load near the screen, the reschedule
  picker and phone OTP on use, the door-code panel paints a light view and loads its actions on the first tap.
