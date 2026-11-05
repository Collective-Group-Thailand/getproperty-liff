# JL1 — My common fees (plan + record)

Step JL1 of `docs/prompts/J-juristic-liff.md` (pack J), after api J1.2 (J1.1a, J1.1b, J1.2a, J1.2b). Branch
`feat/JL1-common-fees` from `main` `4985566` (JRL merged). Design lead: Claude (D-J20); references
`../design/J-DESIGN.md` §1 (firm, never shaming; vocabulary by property kind), §3 *liff-common-fees* and the Stitch
image `stitch/j/liff-common-fees.png`. Playwright specs are written, not run (founder 2026-10-28).

## Contract
`API_CONTRACT_REF=5127e3f662389bdb6ff38f3ce886ad607124f262 pnpm gen:api --adopt` (api `5127e3f6`, read with
`git show` — the api working tree is on a feature branch); lock `sourceCommit` = that SHA. New resident operations
used: `resident.statements.list|document`, `resident.units.budgetVsActual`, `resident.units.requestPaymentPlan|paymentPlans|withdrawPaymentPlan`,
`resident.units.createPaymentMandate|paymentMandates|cancelPaymentMandate`,
`resident.units.requestDebtClearance|debtClearances|debtClearanceDocument`; `propertyKind` / `legalForm` on
`ResidentMeUnitDto` (CR #41 done); slip reasons `date_out_of_window`, `duplicate_reference_platform`, problem
`payment.duplicate_slip`.

## Gaps (contract requests, nothing invented silently)
- **#42 unit measures** — the statement line shows the unit's size and share (condo: ตร.ม. + อัตราส่วนกรรมสิทธิ์; village:
  ตร.วา). `ResidentMeUnitDto` has neither. Ask for `areaSqm`, `ownershipRatio`, `landAreaSqwa`, `plotNo`. The mock
  sends them (marked `CONTRACT-REQUEST`); the app reads them as optional and prints nothing when absent.
- **#43 total across units + one payment** — invoices are per unit; the paper's strong total across units would be a
  sum in the browser (forbidden). Ask for a dues summary (`GET /v1/resident/dues` → per period `{ periodKey,
  invoiceIds, total, dueDate }` + grand total) and a multi-invoice QR. Until then: a period with one open invoice shows
  its balance as the total; several show each unit's amount and "pay one unit at a time" with the soonest due first.
- **#44 recurring availability** — the auto-pay link must be hidden when the channel is off, but only a `POST` answers
  `recurring.unavailable`. Ask for `recurringAvailable` per unit (on `/me/units` or the mandates list). Until then the
  link is shown; the first 409 explains "not offered in this building yet" and the device remembers it (try/catch
  storage) so the link stays hidden there.
- **#45 plan limits** — `juristic.plan_max_instalments` and the latest `firstDueOn` are not readable by a resident. Ask
  for `GET …/payment-plan-requests/options` (`minInstalments`, `maxInstalments`, `latestFirstDueOn`, `proposedPrincipal`).
  Until then the form validates the contract's own minimum (2) and an integer; the upper limit is the API's 422 shown
  at the field.
- **#46 budget resolution document** — the budget card links "the resolution"; `BudgetActualIncomeDto` has no
  resolution or document. Ask for `resolution: { meetingDate, documentId } | null` + a resident document endpoint.
  Until then the card has no link (no dead link). `expenseSideAvailable=false` → the card shows *approved income vs
  billed so far* honestly labelled (not "used").
- **#47 collection letters for residents** — the J1.2b notices (`juristic.collection.*`) are LINE / e-mail only; there
  is no resident read endpoint, so the "readable letter view" of the prompt cannot be built. Ask for
  `GET /v1/resident/collection-letters` + document. Deferred.

## Screens (phone 360–390 px, one filled action each)
1. **`/fees` ค่าส่วนกลางของฉัน** (bottom nav *bills* active; entry from the co-owner home hero "รายละเอียด" and the
   documents row). Header: title, lede "{period} · {role}"; status badge from the soonest open invoice
   (`รอชำระ` / `ชำระแล้ว`, never "ค้าง"). **Paper per period** (period key from the invoice's `periodStart`/`periodEnd`:
   `YYYY` annual, `YYYY-Hn`, `YYYY-Qn`, `YYYY-MM`): issuer (the juristic person), title "ค่าส่วนกลาง ปี 2570" etc.,
   per-unit blocks — mono unit tag, size by kind (ตร.ม. / ตร.วา, CR #42), share line, the unit's amount (the invoice's
   balance), its common-fee / fund lines muted under it — double-rule total, due line (muted; amber ≤ 7 days; red only
   after the due date, words "เลยกำหนดมา n วัน"). Actions: filled **ชำระด้วย QR พร้อมเพย์** (existing `PayLauncher`
   for the soonest open invoice), outlined **แนบสลิปโอนเงิน** (the same sheet opened on the slip step), text link
   **ตั้งหักอัตโนมัติ** with the repeat icon (hidden when unavailable, CR #44; "หักอัตโนมัติเปิดอยู่" when a mandate is
   active). **Budget card** (`budget-vs-actual`, 404 → no card): fiscal year, approved income vs billed so far, one thin
   bar (the API's `billedVsBudgetPct`), as-of date. **Documents** rows: statements, receipts, payment plan, debt clearance
   certificate (co-owner only; payer has `invoices` only → no clearance row). Nothing due → a calm "ไม่มียอดที่ต้องชำระ" paper.
2. **`/statements`** list (month, number, ยอดที่ต้องชำระ, units) → **`/statements/[id]`** paper: opening, charges,
   credits, payments, closing, amount due, open invoices (unit, period, balance, due), delivered via; outlined *open PDF*
   (`statement.document_pending` → "being prepared").
3. **Payment plans** `/units/[unitId]/payment-plans` (list + next due + "ขอผ่อนชำระ" when no open plan) →
   `/units/[unitId]/payment-plans/new` (instalments stepper, first due date optional, note; 409 `open_exists` → link to
   the plan; `nothing_due` → calm card) → `/units/[unitId]/payment-plans/[planId]` record: state, proposed / approved
   principal, instalments table (seq, due, amount, state), next due, decided reason; withdraw (outlined danger, confirm
   dialog) while `withdraw` is in `nextActions`.
4. **Debt clearance** `/units/[unitId]/debt-clearances` (status list; request card) → `/new` (as-of date today … +60,
   language th/en) → issued: certificate record (number, as of, valid until, code hint) with outlined download + share;
   requested (fee): "waiting for the office"; **refused for outstanding** (409 `debt_clearance.outstanding`): a calm
   card "ยังมียอดที่ต้องชำระ ฿x" + filled *pay first* → `/fees`; `refused` by the office with its reason.
5. **Auto-pay** `/units/[unitId]/auto-pay`: my mandates (method, masked, state); create (direct debit / card) →
   `openExternal(setupUrl)`; cancel (confirm); 409 `recurring.unavailable` → explanation, link hidden afterwards.
6. **Deep links**: roots `fees`, `statements`, `units`; `/invoices?unitId=` accepted as `?unit=`.
7. **Slip**: reasons `date_out_of_window`, `duplicate_reference_platform`; a rejected platform duplicate and a 409
   `payment.duplicate_slip` say "this transfer already paid a bill on getproperty — send the slip of this payment".

## Vocabulary by kind (J-DESIGN §1.3)
`resident.fees.kind.<kind>.unit|size` — condo / apartment / office… from `propertyKind`; `null` → condo words. Never
`if (kind === …)` in JSX for copy: `kindWords(kind)` returns the i18n keys.

## Tests
Vitest: `fees/model.test.ts` (period keys, grouping by period × unit, due tone rules incl. 7-day / overdue, kind
vocabulary, plan request validation, outstanding refusal mapping), mocks (`mocks/juristic.test.ts`: statements,
plans open_exists / withdraw, clearance outstanding → issued after paying, mandates unavailable), component tests for
the plan form and the clearance flow. Playwright (written): `e2e/fees.spec.ts` (fees view, plan request / withdraw,
clearance refused then issued, statement PDF, six locales + axe). Storybook: `Resident/Common fees` stories.

## Gates
lint · format:check · typecheck · unit · shared:check · gen:api --check · build · build-storybook · lhci ≤ 180 KB
(new set `common-fees`, system Chrome).

## Record (2026-11-05)
Done as planned, plus: the top bar and switcher name the unit by kind (shell `unitSwitcher.unit` select); icons re-synced
from web `3d513cf` for the `repeat` glyph; `PayLauncher` / `PaySheet` open on the slip step. The debt-clearance
certificate view loads on issue (the request page measured 182.3 KB with it eager, 178.8 KB lazy). Web's new
`formatPeriodKey` (quarter / half / year words, th / en only) is not copied: period words live in `resident/fees.json`
for six locales. Gates and figures: PROGRESS 2026-11-05 (JL1).
