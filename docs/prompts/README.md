# Prompt pack — getproperty-liff (resident LINE Mini App)

คำนำหน้ามาตรฐาน: `Read CLAUDE.md, docs/prompts/00-master-plan.md, docs/decisions.md, docs/contract/api-conventions.md and docs/prompts/design-system.md.`

| Step | Kickoff (ต่อท้ายคำนำหน้ามาตรฐาน) | Release |
|---|---|---|
| L0 | — done (`L0-setup.md` records it) | R1 |
| L1.1–1.3 | `Then read docs/prompts/L1-foundation.md. Do Deliverable 1.N only. Plan first.` | R1 |
| L2.1–2.2 | `Then read docs/prompts/L2-bills-pay.md. Do Deliverable 2.N only. Plan first.` | R1 |
| L3.1–3.3 | `Then read docs/prompts/L3-lease-usage-profile.md. Do Deliverable 3.N only. Plan first.` | R1 |
| L4.1–4.4 | `Then read docs/prompts/L4-r2-service-requests-community-technician.md. Do Deliverable 4.N only. Plan first.` | R2 |
| L5.1–5.4 | `Then read docs/prompts/L5-landlord-listings.md. Do Deliverable 5.N only. Plan first.` | R3 (D-250–D-253, Proposed; needs api B7.3–7.6 or MSW) |

L2 ขนานกับ L3 ได้หลัง L1 (รันกับ MSW + fake LIFF) · ต้อง `pnpm gen:api` ทุกครั้งที่ `getproperty-api` tag release ใหม่ · ก่อนแก้ไฟล์ใน `src/ui`, `src/i18n/format.ts`, `src/domain/status` ให้แก้ที่ `getproperty-web` ก่อนแล้ว copy มา (`docs/shared-copies.md`, `pnpm shared:check`)

`design-system.md` เป็นสำเนาจาก getproperty-web (มาตรฐานร่วม) — §5 "Resident app" คือ repo นี้

## หลังทุก session
ตรวจ `docs/PROGRESS.md` · endpoint ที่ขาดอยู่ใน `docs/contract-requests.md` → ส่งให้ `getproperty-api`
