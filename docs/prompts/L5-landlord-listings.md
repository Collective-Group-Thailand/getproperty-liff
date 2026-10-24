# L5 — Prospects in LINE (enquiry, viewing, apply), lease signing for landlords' residents, landlord quick actions

> อ่าน `CLAUDE.md`, `00-master-plan.md`, `docs/decisions.md`, `docs/contract/api-conventions.md`, `docs/prompts/design-system.md` ก่อน · ต้องมี contract จาก getproperty-api B7.3–7.5 (`pnpm gen:api`) หรือ MSW mock ที่ติด `// CONTRACT-REQUEST` · ทำทีละ Deliverable · Plan Mode ก่อน

---

You are a senior frontend engineer on **`getproperty-liff`**. Decisions **D-250 – D-255** (Proposed, 2026-10-24) rule here. LINE is where both sides already are: the person looking for a home and the owner renting it out.

## Deliverable 5.1 — Prospect flow (D-252, api B7.3)
1. Deep link from a public listing (`/rent/[slug]` on the web) opens the LIFF prospect flow: listing summary → consent screen (PDPA purpose "rental enquiry", D-025) → enquiry (move-in date, term, occupants, message) **or** pick a viewing slot → confirmation.
2. "My enquiries": status per listing, reschedule/cancel viewing, directions to the address.
3. Languages: th, en first (prospects are often foreign); my/km/lo/zh follow the resident app's catalogue.
4. Acceptance: e2e with fake LIFF: enquiry and viewing booking; double-booking error handled. Outside LINE the same flow signs in with phone, Google or Apple (D-255).

## Deliverable 5.2 — Apply, sign, pay the move-in amount (D-253, api B7.4–7.6)
1. After the owner creates a lease from the lead, the prospect receives it in LINE: review (th/en side by side), e-sign (D-062), pay deposit + advance rent through the payment gateway QR (D-250; a fee line shown only if the building passes it to the resident), receive the deposit & advance-rent receipt.
2. Move-in inspection: view and countersign the owner's inspection report with photos.
3. Rent payment certificate request (owner approves in the console; the PDF arrives in LINE).
4. Acceptance: e2e lead → lease → sign → pay (fake gateway) → receipt; inspection countersign.

## Deliverable 5.3 — Landlord quick actions in LINE (D-251)
1. For users whose tenant is a landlord: a light LIFF home with today's items — new leads (reply, confirm viewing), payments received, overdue rent (send reminder), lease ends soon (re-list or renewal offer). Heavier work links to the web console.
2. Acceptance: e2e reply to a lead and confirm a viewing from LIFF.

## Deliverable 5.4 — Account linking for an operator's own LINE OA (D-254, api B7.7)
1. Link page opened from the OA's link-token message: who is asking (building / landlord name and logo), consent, confirm with the resident's existing getproperty identity (LIFF login; new residents continue to the normal invitation flow), success state that returns to the OA chat.
2. Rich-menu targets (bills, pay, lease, repairs) work the same whichever OA opened the LIFF.
3. Acceptance: e2e link from a fake own-OA webhook token → linked; expired/used token handled.

After each deliverable: `docs/PROGRESS.md`, `docs/contract-requests.md`, commit.
