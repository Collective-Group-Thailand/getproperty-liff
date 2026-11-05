# JL4 — Visitors, gate, SOS (plan + record)

Step JL4 of `docs/prompts/J-juristic-liff.md` (pack J), after api J4.1 + J4.2 (D-315, D-316, D-317, D-320, D-327,
D-328). Branch `feat/JL4-visitors-gate-sos` from `main` `1905695` (JL1 merged). Design lead: Claude (D-J20);
references `../design/J-DESIGN.md` §1 (privacy visible, property kind changes words), §3 *liff-visitor-approve*,
§4 *hold-to-confirm*, and `stitch/j/liff-visitor-approve.png`. Playwright specs are written, not run (founder
2026-10-28).

## Contract
`API_CONTRACT_REF=b3e89b8386233086c51f8f0c131e8f0a74200b6f pnpm gen:api --adopt` (api `b3e89b83`, main after
J4.2); lock `sourceCommit` = that SHA. Resident operations used: `resident.visits.list|get|approve|deny|callMe|exit`,
`resident.units.gate|setGatePolicy|visitInvites|createVisitInvite|revokeVisitInvite|rememberedVehicles|forgetVehicle`,
`resident.unitVehicles.list|create|delete`, `resident.gates.list|open`, `resident.sos.list|create|get|cancel`.
Realtime: `gate.visit.*` and `gate.incident.*` reach `unit:<id>` (ids only) → the existing `RealtimeBridge` refreshes
`/visits`, `/visitors`, `/sos` and home; a requested visit and an open SOS also re-read every 15 s while visible
(a dropped stream must not leave a visitor waiting).

## Gaps (contract requests, nothing invented silently)
- **#49 gate capability per unit** — the visitors tab must follow the unit, but `ResidentUnitCapability` has no
  `gate`. Until then: a unit of a juristic estate (`legalForm` set) on which I hold a gate role (co-owner, tenant,
  co-tenant, family — not payer-only) shows the tab; `/visitors` of an estate without gates says so calmly.
- **#50 remember days** — "จำรถคันนี้ 30 วัน" needs `gate.remember_days`; neither the visit nor the gate view carries it.
  Read as optional `rememberDays` on `ResidentGateDto` / `ResidentVisitDto.policy` (mock sends 30, marked
  `CONTRACT-REQUEST #50`); absent → "จำรถคันนี้ไว้" without a number.
- **#51 invite limits** — `gate.invite_max_days` is not readable; the form checks order and the contract's limits, the
  maximum window is the API's 422 `visit_invite.window_too_long` at the field.
- **#52 one invite by id** — the invite record page looks the invite up in the list (like CR #48).

## Screens (phone 360–390 px, Anuphan, one filled action each, unit word by kind)
1. **`/visits/{visitId}`** (LINE Flex buttons open `?answer=approve|deny|call_me`): title "มีผู้มาติดต่อที่{gate}",
   status badge; lede = countdown m:ss + the house policy line in the API's words; photo (5-minute link) with the gate
   and time, or a calm plate placeholder (no stock image); plate card (mono, province tag); three facts (kind with icon,
   name, arrived); filled **อนุญาตให้เข้า**, outlined **ให้ รปภ. โทรหาฉัน** (`call-me`), outlined danger **ไม่อนุญาต**;
   checkbox **จำรถคันนี้ 30 วัน** (unticked; only with a plate); the household line. After any answer the actions become
   a **result card** (who answered, when; timeout → what the house policy did; someone else first → "มีคนในบ้านตอบไปแล้ว").
   `?answer=` never acts: it opens a confirmation that names the plate; a visit already answered shows the result.
2. **`/visitors`**: header with outlined danger **ฉุกเฉิน** (SOS sheet); **open barrier** panel (filled) when a gate of
   the estate lets residents open with a registered car; waiting + today's visits; invites (active / waiting
   approval) + "สร้างบัตรผ่าน"; rows to cars and the house policy; history link.
3. **`/visitors/history`** paged visits of the unit. **`/visitors/invites/new`** form → QR shown once + share to LINE
   (`shareToLine`, system share, clipboard) with a public **`/pass#…`** page that draws the QR from the fragment (the
   token never reaches a server log). **`/visitors/invites/{id}`** record + revoke.
4. **`/visitors/cars`** household cars (add / remove when `canEdit`), remembered cars (forget).
5. **`/visitors/policy`** house gate policy (timeout, action, deliveries, note) — read-only for family with the reason;
   the privacy notice from the API.
6. **`/visitors/open`** (home quick action, deep link) — the same open-barrier panel full page: choose gate / car,
   geofence explanation + location only when `requireGeofence`, states sending → opening → sent / rate-limited (seconds
   from `Retry-After`) / not allowed / outside / no location / failed.
7. **SOS sheet** (lazy): kind picker (fire, medical, intrusion, other), optional note, **hold-to-confirm 1.5 s ring**
   (release cancels; keyboard and screen-reader users get a focusable "send with confirmation" button that opens a
   confirm dialog) → **`/sos/{id}`** status: sent → acknowledged by the guard → resolved; cancel while
   `cancellableUntil` (countdown); `existing` → "แจ้งไปแล้ว — นี่คือเหตุที่เปิดอยู่".
8. **Shell / home**: visitors tab (shield) for gate units — five items at most (usage moves to the home tiles when
   both are present); home of a gate unit: waiting visitors row, open-barrier quick action (with cars), emergency row.

## Pure models + tests (Vitest)
`visitors/model.ts`: countdown (`secondsLeft`, `clock`), policy line key, result kind (mine / someone else / timeout /
entered / exited), deep-link answer parsing, invite validation (`validateInvite`), role edit rights (`canEditGate`,
`gateUnit`), plate formatting. `visitors/gateOpen.ts`: open-barrier state machine + problem mapping. `sos/hold.ts`:
hold-to-confirm controller (progress, release cancels, completes at 1.5 s). Component tests: deep-link confirm,
hold button (pointer + accessible path), invite form errors. Mock tests: visits answer first-wins / someone-else,
invites, cars, open rate limit, SOS create / existing / cancel window.

## Mocks (`mocks/gate.ts`)
Gates per juristic property (condo C-1203 "ป้อมหน้า"; village 88/12 "ป้อม 1"), visits, invites, cars, policy, SOS,
stateful. Words: `…visitor…` one waiting visit with photo, `…nophoto…` without, `…mycar…` a registered car (two with
`…twocars…`), `…geofence…` location required, `…gateoff…` resident open disabled, `…housefamily…` family member of 88/12.
Mock-only controls: `POST /v1/resident/__mock/units/{unitId}/visits` (guard records a visit), `POST
/v1/resident/__mock/visits/{id}/answer` (another household member answers), `POST /v1/resident/__mock/sos/{id}/acknowledge`.

## Gates
lint · format:check · typecheck · unit · shared:check · gen:api --check · build · build-storybook · lhci (new set
`visitors`) ≤ 180 KB · screenshots at 390 in `_shots/j-JL4/`. Playwright specs written: approve from link, someone
else answered, invite create/share, open barrier, SOS hold + cancel.
