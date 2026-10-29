# G-review — fixes for the independent review of GL1–GL4 (`/home/claude/review-liff.md`)

Sandbox main at `82e5110` (e2e 167/167). Every finding re-verified against the code (and, where the answer depends
on it, the api source) before the fix; each fix gets a regression test that fails before and passes after.

| # | Fix | Test |
|---|---|---|
| M1 | `ESignFlow`: the drawn signature is dropped whenever the flow is on the reading step (*Back*, `changedCode`, a reloaded document) — *Next* on the draw step needs a new drawing | `ESignFlow.test.tsx` (back → draw disabled; `changedCode` → read → draw disabled) |
| M2 | `ESignFlow` gets `renderedSha256` (the hash of the version the server rendered the reader for; contracts pass `contract.sha256`). After every document load the reader must be known to show that version: equal hashes → ready; otherwise `router.refresh()` (in a transition) and *Next* waits for it; a reader re-rendered for another hash reloads the document (and the reading starts again). Leases have no hash on the DTO → one refresh after each load, so the reader is never older than the hash (a newer reader is refused by the API with `lease.contract_changed`). `changedCode` → read again + refresh. Note `read.updated` (6 locales) | unit (refresh called on `changedCode`; mismatch blocks *Next* until the refreshed reader matches); e2e `contracts.spec` (office changes a clause while the resident signs → the reader shows the new clause → signed; office changes it between render and the document fetch) |
| M3 | Recommendations: *Stop* whenever a grant is on file (`state !== "off"`), with an outdated hint. Relocation: an *outdated* card with *Stop* (current version, as the recommendations withdraw does — an older version would leave the state outdated) | unit (`RecommendationsScreen` outdated → `recommendations-withdraw`); e2e recommendations v2 → stop → `?stopped=1`; e2e relocation v2 (new mock control `POST /v1/resident/__mock/consents/{key}/publish`) → stop |
| L1 | Fingerprint = sha256 of the PNG (WebCrypto), not its length; `idempotency.key_reused` drops the key | unit (`signatureFingerprint` differs for two same-length PNGs; the retry after `key_reused` sends a new key) |
| L2 | Door code's box hidden synchronously on hide / `pagehide` (`hidden` on the element, then the state; `flushSync` was tried first — its `react-dom` import regrouped every page's shared chunks, +0.9 KB) | unit (dispatch `visibilitychange` → the code is not visible synchronously, then removed) |
| L3 | `viewing.access_invalid_state` → code dropped + refresh; `renewal.invalid_state` → refresh (dialog / form closed); `contract.already_signed` / `lease.already_signed` → refresh (the page shows *already signed*) | unit for the three components |
| L4 | `/recommendations/history?page=N` keeps the page on the redirect and on the prospect sign-in return path (`historyPath`) | unit (`historyPath`) + e2e anonymous `?page=2` |
| L5 | The verification panel remembers a safe `next` in `sessionStorage` before leaving for the provider; `/rent/verification` without `next` (the API's fixed return page) offers *back to the booking* from it | unit (`returnPath` store / read, unsafe ignored) + e2e (self-viewing returns to `/rent/verification` without `next`) |
| L6 | *Open the PDF* fetches the document again on every tap (fresh 5-minute URL); a different hash there is handled as `changedCode` | unit (second tap → second `loadDocument`) |

Gates: lint, format:check, typecheck, unit, `shared:check`, `gen:api --check`, build, targeted e2e, full e2e, Lighthouse
for the sets whose pages changed.
