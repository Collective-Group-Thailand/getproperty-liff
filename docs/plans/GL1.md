# GL1 — Marketing consent & preferences (plan)

Step GL1 of `docs/prompts/G-growth-liff.md`, after api **G6** (Mac `b22571d`, sandbox `e8b5a1b`; D-300, O-023 / O-027
updated, no new O). Requirements: D-300 (1)–(3) and (5) (the LINE message links to the settings page), D-287, D-025
(PDPA: separate optional consent, never pre-ticked, withdrawal as easy as consent), D-064 (six languages), D-179
(page budgets).

## 0. Contract and docs
- `API_CONTRACT_REF=e8b5a1b… pnpm gen:api --adopt` (never HEAD — G9 commits in parallel), lock `sourceCommit` =
  `b22571de1deb0c3914eb2fba17fb3a62a055fad6`, `pnpm gen:api --check`. The contract also brings G4, G5 and G8 — fix
  what breaks (mocks). G8's relocation screens are GL4, not here.
- Re-sync `docs/decisions.md` from api `e8b5a1b` (D-296 … D-300, O-023 / O-027 / O-029 amended, O-032).

## 1. Endpoints (resident and prospect — one LINE login, the same answer on both surfaces)
`GET/PUT /v1/{resident|prospect}/me/recommendations`, `POST …/actions/withdraw`, `GET …/history` (paginated),
`GET /v1/public/listings/areas` (area slugs). Opt-in sends `consentVersion` = `consent.version` only when the box is
ticked (never pre-ticked, never sent by default); an earlier grant keeps without it. Errors:
`recommendations.consent_required` / `recommendations.consent_outdated` (409 → re-read, show the new text, ask
again); 422 `validation.failed` (unknown area, ranges) shown at the field.

## 2. Routes
- **`/recommendations`** — the target of the LINE message's "why did I get this / stop" bubble
  (`${PUBLIC_RESIDENT_APP_URL}/recommendations`). Signed in as a resident → the screen in the resident frame;
  otherwise → `/rent/recommendations` (prospect frame; the proxy renews prospect sessions there and an anonymous
  visitor signs in as a prospect, which works for anyone with LINE — the consent belongs to the login, not to a
  landlord).
- **`/rent/recommendations`** — the same screen for prospects (guard `requireProspect`).
- **`/recommendations/history`**, **`/rent/recommendations/history`** — what was sent to me, paged (`?page=`).
- Entry points: a profile row (resident, *on / off*) and a card on *my enquiries* (prospect).

## 3. The screen (server-rendered; only the actions are client code)
1. Status: *on since …* with **Stop recommended places** (one tap, no dialog — withdrawal as easy as consent;
   `?stopped=1` then says nothing more is sent and the preferences are no longer used) / *off*.
2. The consent text **exactly as the API returns it** (title, Markdown body with the profiling note, version, Thai
   for Thai readers, English for the other languages with a note — never translated here).
3. Preferences (client form, loaded as it comes near the screen): areas (search + up to 10 chips, Thai / English
   names from the API), budget from / to (decimal strings, no arithmetic), kinds of place (chips), move-in from / to,
   language of the messages (six), quiet hours (platform default from the API, or my own from / to), the weekly cap
   from the API. Off → the consent box (unticked) + *Receive recommended places*; on → *Save changes*.
4. Quiet hours and the cap are shown as the API returns them (`quietHours`, `maxPerWeek`) — nothing hard-coded.
5. History preview (latest 3) + link to the full history: date, the ad label as returned, sponsor, listings (link
   to `/rent/{slug}` while public, else *no longer listed*). Empty state.

## 4. G4 item: `/link/oa` for prospects
Signed in as a resident → resident endpoints (unchanged); else signed in as a prospect →
`GET /v1/prospect/messaging-links/{token}` + `POST …/actions/confirm` (prospect frame, done → my enquiries);
else the resident sign-in as before. The proxy renews both sessions on the shared paths (`/link/oa`,
`/recommendations`).

## 5. Copy, mocks, tests, budget
- New `shared/recommendations.json` in **all six locales** (my/km/lo/zh drafted — native review), profile row,
  enquiries card.
- Mocks `mocks/recommendations.ts`: per account (same login on both audiences), the API's seeded th / en text (v1;
  `gp_mock` `recommendations.version=2` publishes v2 → outdated), validation like the API (≤ 10 areas from the area
  list, ranges, language), withdraw, history seeded for subjects with the word `adsseen`; public areas list; prospect
  messaging links.
- Unit: model (state, Markdown blocks, request body, field errors), mocks flows (never granted by default, outdated,
  withdraw, history, 422 unknown area), proxy renew kinds, BFF route.
- e2e `recommendations.spec.ts` — written, not run (founder 2026-10-28).
- Lighthouse: add the resident `/recommendations` and the prospect `/rent/recommendations` to the sets; ≤ 180 KB.
