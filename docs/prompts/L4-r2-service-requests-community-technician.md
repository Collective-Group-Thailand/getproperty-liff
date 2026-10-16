# L4 — R2: service requests, announcements, parcels, access, languages, technician work orders

> อ่าน `CLAUDE.md`, `00-master-plan.md`, `docs/decisions.md`, `docs/contract/api-conventions.md`, `design-system.md` ก่อน · ต้องทำ L1–L3 เสร็จแล้ว · ทำทีละ Deliverable (4.1 → 4.4) ต่อ 1 session · **R2**
> ที่มา: getproperty-web `F3-tenant-liff.md` §3.4 เดิม (repairs → `service_request`) + blueprint A4.1–A4.3 (technician LIFF) — ศัพท์ตาม D-151, workflow/SLA ตาม D-159

---

You are a senior frontend engineer on **`getproperty-liff`**. Build the R2 resident community features and the technicians' work orders.

## Deliverable 4.1 — Service requests (A4.1, B5)
1. **Create**: category, urgency, description, photos (`CameraCapture`, multi-shot, client compression, presigned upload), preferred time; for a unit under warranty from getbuild the API may route it to the developer — show what the API says, never decide here.
2. **Track**: status timeline (`Timeline`) from the `workflow_instance` events (D-159), SLA state as the API reports it, chat-like updates with the operator/technician, appointment confirmation, rating on close.
3. Tests: create with photos on mocks; status timeline rendering every `ServiceRequestStatus`; rating; axe.

## Deliverable 4.2 — Announcements, parcels, contacts, access
1. Announcements with read receipts (and the LINE message deep-linking to the exact announcement via `liff.state`).
2. Parcels: list, pick-up confirmation PIN / QR shown big enough to scan; building contacts (call / LINE OA chat via `openExternal`).
3. Access (where locks exist, C1): own credentials, unlock log for own unit, visitor code request (if the operator allows).
4. Tests: flows on mocks; axe.

## Deliverable 4.3 — Languages my / km / lo / zh (D-064)
1. Fill `messages/{my,km,lo,zh}` (machine-translated base, reviewed); keep English fallback for anything missing (`messages.test.ts` already checks keys ⊆ English).
2. Fonts: add Noto Sans Myanmar / Khmer / Lao / SC subsets — in getproperty-web `src/ui/fonts` + `scripts/copy-fonts.ts` first, then copy here (`docs/shared-copies.md`); keep the resident JS/LCP budget (load script subsets only for that locale).
3. Language switcher shows all six; `formatDate`/`formatTHB` behaviour for non-Thai locales follows getproperty-web's `format.ts` (re-copy if it gains locale support).
4. Tests: rendering in all six locales (font coverage check for Myanmar/Khmer scripts, no tofu), no horizontal scroll at 360 px for the longest strings; axe.

## Deliverable 4.4 — Technician: my work orders (A4.3, audience `technician`)
1. Turn on `FEATURE_TECHNICIAN` per environment; technician login through the same LIFF entry with audience `technician` (`/v1/auth/technician/line`), linking by invitation code from the operator; BFF allow-list `/v1/technician/*`.
2. **My work orders**: list by schedule, detail (unit, building, request with photos, contact the resident through the platform, never personal numbers unless the API provides them), check-in, before/after photos, parts and cost entry, close; resident rating shown after close. Offline tolerance light (retry queue for photo uploads), not the staff PWA's full offline mode.
3. Technicians never see resident screens (separate `me`, nav and guards) and residents never see `/technician`.
4. Tests: login + linking (fake LIFF), close a work order with photos on mocks, guard tests both ways; axe; Lighthouse `technician` URL set.
