# J — Resident LINE Mini App for juristic estates · getproperty-liff

Kickoff prefix: the repo's standard prefix (CLAUDE.md, master plan, design-system.md, `../docs/design/DESIGN.md`) + `../docs/design/J-DESIGN.md` + `../getproperty-api/docs/prompts/J-README.md` + this file. `Do JL<N> only. Plan first, then execute.` Adopt the contract with `API_CONTRACT_REF=<api sha> pnpm gen:api --adopt`. Six locales for every resident string. Phone only (360–390 px), one filled action per screen, bills as paper documents.

## JRL — Units, roles and the co-owner home (after JR)
- Unit switcher in the top bar when `GET /v1/resident/me/units` returns > 1 ("ทุกห้องของฉัน (2) ▾" + per unit); remembers the last choice (try/catch storage).
- Home adapts to role: tenant = today's home; co-owner = common fees due, notices, visitors, documents; family = notices, parcels, visitors.
- Lease-bound screens (lease, renewal, review, move-out, relocation) hidden unless the role allows.
- Redeem unit invite: `/join/[code]` → OTP → unit added.
Acceptance: units for role → navigation mapping; existing e2e unchanged (deferred run); new specs for co-owner and family.

## JL1 — My common fees (after J1.2)
- `/fees` (Stitch `liff-common-fees-mobile`): statement as paper per year/period across units (unit, area or ratio/plot size, amount), total, due; pay with QR (existing pay flow), attach slip (existing, duplicate-slip error copy), set up yearly auto-pay (recurring — fake adapter, shows "ยังไม่เปิดให้บริการในอาคารนี้" when the API says unavailable).
- Budget card: approved vs used, link to the resolution document.
- Payment plan: request a plan (amount of instalments within the API limits), view instalments, next due.
- Debt clearance: request, status, download certificate, share link.
- Collection notices: readable letter view of the reminder/notice the resident received.
Acceptance: units for statement grouping and plan request validation; Playwright specs (deferred); lhci ≤ 180 KB.

## JL4 — Visitors, gate, SOS (after J4.2)
- Approval screen from LINE push (Stitch `liff-visitor-approve-mobile`): car photo, plate in mono, kind, name, arrived time, countdown to the house policy; filled "อนุญาตให้เข้า", outlined "โทรหา รปภ.", outlined danger "ไม่อนุญาต"; "จำรถคันนี้ 30 วัน"; result screen shows who answered if someone else did.
- `/visitors`: today and history (own unit only), invites (create: kind, date/time window, single/multi use, optional plate → share QR to LINE chat), remembered cars, my vehicles.
- House gate policy setting (timeout action) for owners/co-owners.
- Open barrier: big button on `/visitors` for own vehicles when the API allows; state feedback.
- SOS: entry in the bottom sheet "ฉุกเฉิน" with kind picker and confirm hold (press-and-hold 1.5 s to avoid accidents), then status of acknowledgement.
Acceptance: units for countdown, invite validation, hold-to-confirm; Playwright specs (deferred); lhci ≤ 180 KB.
