# GL3 — Contracts & renewals for residents (plan)

Step GL3 of `docs/prompts/G-growth-liff.md`, after api **G3** (Mac `36c7c79`, D-294, O-030; legal review open under
O-025). Requirements: D-290 (contract library, renewals), D-294 (signable documents, renewal offers), D-062
(e-signature evidence: SMS OTP + LINE + PDF sha256), D-219 (move-out after the lessee's notice), D-020.

## 0. Contract and docs
- `API_CONTRACT_REF=HEAD pnpm gen:api --adopt` (api 6690faf → G3; brings G0–G2 too), lock `sourceCommit` =
  `36c7c79eb15a54db50a7cd2aaa3d9c4d0f114802`, `pnpm gen:api --check`. Fix whatever the G0–G2 contract changes break.
- Re-sync `docs/decisions.md` from getproperty-api (D-284 … D-294, O-022 … O-030); `api-conventions.md` unchanged.

## 1. Endpoints used (resident audience only)
`GET /v1/resident/contracts[/{id}]`, `GET …/{id}/document` (5-minute URL + sha256), `POST …/{id}/signature/otp`,
`POST …/{id}/sign` (Idempotency-Key; OTP + sha256 + drawn PNG), `GET /v1/resident/renewal-offers[/{offerId}]`,
`POST …/{offerId}/actions/accept` (Idempotency-Key, no body), `POST …/{offerId}/actions/decline` (Idempotency-Key,
optional reason). Prospect contract signing (`/v1/prospect/contracts`) is not part of GL3 (residents only).

## 2. Screens (resident, six locales)
- **`/contracts`** — documents waiting for my signature, signed ones, and renewal offers (open first). Empty / error
  states. Entry points: home card when something waits (contracts to sign or an open offer), the lease page link,
  the LINE message (`contract.sent_for_signature` → `/contracts/{id}`; deep-link roots `contracts`, `renewals`).
- **`/contracts/{id}`** — kind, title, number, state (status map `contract`), what was typed when drafted
  (reservation fee / rent / move-in / held until / refund terms; addendum clauses + effective date; notes), signers
  with signed state, the **legal-review state** and the **disclaimer as the API returns them** (`legalReviewState`,
  `disclaimer.th|en` — Thai for Thai, English otherwise; never presented as lawyer-approved), *open the PDF*,
  *read and sign* when `nextActions` has `sign`.
- **`/contracts/{id}/sign`** — the L3 e-signature flow made generic (`ESignFlow`: read to the end → draw → SMS code),
  lease signing becomes one use of it (`SignFlow` keeps its behaviour and test ids); `contract.changed` → read again.
- **`/renewals/{offerId}`** — the landlord's offer: offered vs current rent, months, start date, answer-by, message,
  the B7.5 letter link; **accept** (confirmation → the renewal lease from `newLeaseId` → *read and sign* at
  `/lease/{newLeaseId}/sign`; `compliance.acknowledgement_required` shown with its legal reference, offer stays open) or
  **decline** (confirmation that says the move-out notice follows, optional reason → declined: the lease page with the
  recorded notice / end date). Expired / withdrawn / decided states read-only.
- Lease page: open offer callout + contracts of this lease; the B7.5 `renewal_offer` letter links to its offer.

## 3. Status maps (liff-owned)
`CONTRACT_STATUS` (pending_signature, signed; draft/cancelled never reach residents but are typed), `RENEWAL_STATUS`
(offered, accepted, declined, expired, withdrawn), labels in `shared/status.json` (6 locales).

## 4. Gaps → contract requests
- `ResidentLeaseDto` has no `legalReviewState` / `disclaimer` (lease kinds of the library, own templates) — the lease
  sign screen cannot show them; request CR in `docs/contract-requests.md`, nothing hard-coded.

## 5. Mocks, tests, budget
- `mocks/contracts.ts` — per account: an addendum on the lease waiting for my signature, a signed reservation; an open
  renewal offer on a lease in force (accept → a renewal lease to sign; decline → notice when ≥ 30 days remain).
  Forced problems through `gp_mock` (`resident.renewals.accept=compliance.acknowledgement_required`).
- Unit: BFF body limit for `…/contracts/{id}/sign`, status maps, mocks.
- e2e `contracts.spec.ts` (written; run green before the founder stopped e2e runs, final edits not run — deferred): list → detail (legal-review + disclaimer) → sign (OTP) → signed; renewal accept → sign
  the renewal; renewal decline → notice on the lease; the new screens in all six locales (390 px, axe, no sideways
  scroll, script font); acknowledgement-required problem.
- Budget ≤ 180 KB: server-rendered pages, the decision dialog via `LazyAlertDialog`, the sign flow's pad/OTP lazy.
