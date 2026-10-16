# L3 — Lease & e-sign, move-out notice, deposit, usage, profile & privacy

> อ่าน `CLAUDE.md`, `00-master-plan.md`, `docs/decisions.md`, `docs/contract/api-conventions.md`, `design-system.md` ก่อน · ต้องทำ L1 เสร็จแล้ว (ขนานกับ L2 ได้) · ทำทีละ Deliverable (3.1 → 3.3) ต่อ 1 session
> ที่มา: getproperty-web `F3-tenant-liff.md` §3.1.3 และ §3.3 เดิม — ปรับศัพท์ตาม D-151 (`lease`, `occupancy`, `party`, `unit`)

---

You are a senior frontend engineer on **`getproperty-liff`**. Build the resident's lease, usage and profile screens.

## Deliverable 3.1 — Lease & e-signature (B2.2, B2.3)
1. Lease viewer: the signed contract PDF (viewer or `openExternal`), terms summary (unit, lessee party, co-residents, term, rent and deposit as the API returns them), building rules.
2. **E-signature flow** for a pending lease (sent by the operator from getproperty-web): read contract → scroll-to-end gate → draw signature on a canvas with clear/undo (SignaturePad — build it in getproperty-web `src/ui` first, then copy it here and list it in `docs/shared-copies.md`) → **upload-image alternative** for a11y → phone OTP (`OTPInput`) → signed confirmation with the document hash. `Idempotency-Key` on submit.
3. Building rules acknowledgement.
4. Tests: Playwright with the fake LIFF and the plain web path; signature keyboard alternative; OTP paste; axe.

## Deliverable 3.2 — Move-out notice & deposit (B2.4)
1. **30-day move-out notice** form: date picker with the earliest allowed date from the API (never computed here), confirmation that restates unit + date, the notice document.
2. **Deposit** status & settlement response: deductions with before/after photos from the inspection, proposed refund from the API, accept / dispute with comment and photos (`CameraCapture`).
3. Tests: earliest-date refusal rendered with `legalRef` when the API refuses; dispute with photos; axe.

## Deliverable 3.3 — Usage, profile, privacy (B3.2, B1.3)
1. **Usage**: daily/weekly electric and water usage charts from the series endpoint (buckets) for the resident's unit, comparison with the previous period, "estimated so far this cycle" note only when the API provides it, tips content; every chart has a data-table fallback; works only when IoT meters exist (`meter_assignment`) — the empty state explains the manual reading otherwise.
2. **Profile**: name, phone, language (th/en now; my/km/lo/zh in L4), notification preferences, linked LINE account, documents on file (view only), consent management (withdraw/grant per purpose, D-025), DSR request entry.
3. Tests: chart a11y fallback table; language switch persists via the API and the cookie; consent withdrawal; axe.
