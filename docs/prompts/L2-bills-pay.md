# L2 — Home, invoices, pay, receipts

> อ่าน `CLAUDE.md`, `00-master-plan.md`, `docs/decisions.md`, `docs/contract/api-conventions.md`, `design-system.md` ก่อน · ต้องทำ L1 เสร็จแล้ว · ทำทีละ Deliverable (2.1 → 2.2) ต่อ 1 session
> หลักออกแบบ: "บิลที่จ่ายแล้วสบายใจ" — เห็นยอด เห็นหน่วย เห็นรูปมิเตอร์ สแกนจ่ายได้ใน 2 แตะ · ทดสอบใน LIFF จริงบน iOS/Android และใน browser ปกติ
> ที่มา: getproperty-web `F3-tenant-liff.md` §3.1.2 และ §3.2 เดิม (D-060–D-064) — ปรับศัพท์ตาม D-151: bill → `invoice`, line → `invoice_line`, room → `unit`

---

You are a senior frontend engineer on **`getproperty-liff`**. Build the resident's money screens. Every amount is a decimal string from the API; nothing is computed here.

## Deliverable 2.1 — Home on real data, invoices (B4.2, B4.3)
1. **Home** (replace the L0 sample): unit card (building, unit code, lease term from the `occupancy`/`lease`), the open invoice as the hero card (amount, due date, "scan to pay" CTA; due-date urgency in words, amber only when attention is needed, never red for merely due — D-100), quick tiles (usage, receipts, lease, service requests (R2), announcements (R2), parcels (R2)) from entitlements, notification list; unit switcher for several occupancies.
2. **Invoice list**: open first, then history by period (`billing_cycle`); status via `src/domain/status/invoice`.
3. **Invoice detail**: `invoice_line`s grouped by `source_type` (rent, meter, service, penalty, deposit…); meter lines show previous/current reading, the reading-source badge (D-012), the **meter photo** when it exists (full-screen viewer), units × price per unit (D-022), total, due date, late state; "invoice explained" section with plain-Thai copy from i18n (why the amount, what the tariff is, with the legal reference link — `<Callout legalRef>`).
4. Tests: invoice detail matches contract examples; meter photo viewer keyboard/close; axe; 360 × 780 no horizontal scroll.

## Deliverable 2.2 — Pay, slips, receipts (B4.4)
1. **Pay sheet** (bottom `Sheet`): Thai QR image from the API with amount and reference, "save QR" and "open banking app" helpers where the LINE environment allows (`openExternal()` → `liff.openWindow`, never `window.open`), countdown of QR validity from the API's expiry, live status via SSE → paid state that feels final → receipt link. `Idempotency-Key` on any POST.
2. **Slip upload fallback**: `CameraCapture` (camera/gallery) → presigned upload → submit → verification status; duplicate / amount-mismatch messages from the API's problem codes.
3. **Receipts**: list + PDF viewer (or `openExternal` to the system viewer where LIFF cannot render the PDF) + share to LINE chat (`liff.shareTargetPicker` when available, through the wrapper).
4. Tests: payment state transitions on mocks + SSE; slip upload path; QR expiry; axe; Lighthouse resident budget (LCP ≤ 2.0 s on 4G mid-range, ≤ 150 KB JS) on home, invoice detail and pay.
