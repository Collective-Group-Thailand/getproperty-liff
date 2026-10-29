# GL4 — Relocation & reviews (plan)

Step GL4 of `docs/prompts/G-growth-liff.md`, after api **G8** (relocation network, D-299) and **G9** (verified reviews,
D-301, O-035). Contract: Mac api `02ab053` = sandbox api `0fefa43` (G9 HEAD). Requirements: D-299 (3), D-301 (1) (2)
(5), D-025 (separate optional consents, never pre-ticked, withdrawal as easy as consent), D-256 (rent record travels
only by the resident's own action), D-064 (six languages), D-179 (page budgets).

## 0. Contract and docs
- `API_CONTRACT_REF=0fefa43… pnpm gen:api --adopt` (brings G9: +4 operations), lock `sourceCommit` =
  `02ab053ebf8d3d4aa55985cd0e62d68be51184a2`, `pnpm gen:api --check`.
- Re-sync `docs/decisions.md` from api `0fefa43` (D-301, O-009 note); `api-conventions.md` unchanged.

## 1. Relocation (api G8)
Endpoints: `GET /v1/resident/consents` (purpose `resident.relocation`, text as returned) + `POST /v1/resident/consents`
(grant / withdraw), `GET /v1/resident/relocation-offers`, `PUT …/{offerId}/destination`, `POST …/{offerId}/actions/enquire`
(Idempotency-Key), `POST …/{offerId}/actions/dismiss`.

- **`/relocation`** — status (*on* / *off*), the `resident.relocation` text exactly as the API returns it (Thai for
  Thai readers, English for the others — requested with `Accept-Language: en`, never translated here), an
  **unticked** box + *Turn on* (`granted: true` with the shown version); *Stop* in one tap (`granted: false`; the API
  closes open offers and erases the destination). My offers (unit, landlord, move-out date, state); consented with no
  offer → *appears after a move-out notice* (or *being prepared* when a lease of mine already has notice).
- **`/relocation/{offerId}`** — the LINE message target (`relocation.offer_ready`, deep-link root `relocation`):
  destination form (area / station from `GET /v1/public/listings/areas`, or province + district; highest rent —
  decimal string, format check only), the matched public listings (cover, rent, place, transit, verified badges;
  *already asked* for `enquiredListingIds`), **Ask the owner** in a sheet: message, move-in date, **send my rent record
  with this message** (unticked; the only way it travels — summary of what is sent; hidden when I have no confirmed
  month), the new owner's `prospect.enquiry` consent (unticked, required), one Idempotency-Key per enquiry → done:
  *rent record sent / not sent*, link to the conversation (`/rent/enquiries/{leadId}`). *No more suggestions* →
  confirmation → dismiss. Closed / withdrawn / dismissed offers read-only. Errors: `relocation.consent_required` →
  back to the consent, `relocation.invalid_state` → refresh, `listing.*` at the form.
- Entry points: the move-out notice *done* screen and the lease page while a notice is on file (card *Find your next
  place*), the profile privacy list (consent as usual).

## 2. Verified reviews (api G9)
Endpoints: `GET /v1/resident/leases/{leaseId}/review`, `POST …/review` (Idempotency-Key; `{rating, body, language,
consentVersion}`), `POST …/review/actions/withdraw`.

- Lease page entry **Review this building**: eligible → *Write a review*; `too_early` → *from {eligibleFrom}*;
  my review → its moderation state. Loaded with the page; a failure leaves it out.
- **`/lease/{leaseId}/review`** — eligibility (`not_started`, `too_early` + first day, `window_closed`), tenure months;
  the form: rating 1–5 (radio group, 48 px targets), text 10–2000 with a counter and the *no phone / e-mail / LINE id /
  link / bank / ID numbers* note, language = the page's, the `review.publish` text as returned (th / en; English for
  my/km/lo/zh), its box **never pre-ticked**; errors `review.not_eligible` (with `reviewEligibleFrom`),
  `review.consent_required` (re-read, un-tick), `review.already_submitted` (show mine), `review.personal_data`
  (explain at the text). My review: state (`pending_moderation` → *waiting for the getproperty team*, `published`,
  `rejected` + reason, `hidden`, `withdrawn`), rating, text, tenure months, the owner's reply; **withdraw** after a
  confirmation (text erased, cannot review this lease again).

## 3. Status maps (liff-owned)
`REVIEW_STATUS` (pending_moderation, published, rejected, hidden, withdrawn), `RELOCATION_STATUS` (open, dismissed,
withdrawn, closed), labels in `shared/status.json` (6 locales).

## 4. Mocks, tests, budget
- Mocks: purpose `resident.relocation` (and `review.publish`, as the API lists every resident purpose) in the consent
  list; `mocks/relocation.ts` (offer for a lease under notice while consented; listings in the destination; enquiry =
  prospect enquiry + rent-record share only when asked; dismiss; withdrawal closes and erases); `mocks/reviews.ts`
  (eligibility by scenario words: default `too_early`, `reviewer` eligible, `moveout`… ; submit with the API's checks
  incl. personal-data screening; `POST /v1/resident/__mock/reviews/{leaseId}/moderate` plays the moderator).
- Unit: models, mocks flows, status maps, message manifest.
- e2e `relocation-reviews.spec.ts` — written, not run (founder 2026-10-28): consent on → destination → listings →
  enquire with the rent record → withdraw; review too early / eligible → submit (never pre-ticked, personal data
  refused) → pending → published → withdraw; the new screens in six locales at 360 × 780 with axe.
- Lighthouse set `relocation-reviews`: `/relocation`, `/relocation/{offerId}`, `/lease/{leaseId}/review`,
  `/lease/{leaseId}` ≤ 180 KB — forms, sheets and dialogs load near the viewport / on demand.

## 5. Budget follow-ups (done)
The new routes regrouped Turbopack's framework chunks (≈ +0.9 KB on every page): `/deposit` (proposed settlement) and the
prospect enquiry page were trimmed — `LazyDepositResponse` (+ camera only for a dispute) and `ViewingChanges` (change
time / cancel on first tap). Relocation consent: a *how it works* card above it, Radix checkbox loaded once on screen.
