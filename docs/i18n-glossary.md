# Glossary — Thai ↔ English (D-151)

The words of the resident app. English follows D-151 in code, routes and copy; Thai uses the everyday words
residents say. `src/i18n/messages.test.ts` fails if English resident copy calls a resident a "tenant".

| Concept (code) | English copy | Thai copy | Never |
|---|---|---|---|
| resident (`party` with an `occupancy`) | resident, you | ผู้พักอาศัย, คุณ | tenant (EN) — a *tenant* is the SaaS customer |
| tenant (SaaS customer org) | the building's office, managed by … | ผู้ดูแลอาคาร, ดูแลโดย … | shown as "tenant" to residents |
| unit | unit | ห้อง | room (EN copy) |
| building | building | อาคาร | |
| lease | lease | สัญญาเช่า | contract (EN) |
| invoice | bill (copy), invoice (code) | บิล | ใบแจ้งหนี้ in headings (too formal) |
| payment | payment | การชำระเงิน, จ่าย | |
| receipt | receipt | ใบเสร็จ | |
| landlord — the payee on money screens (the tenant org that issued the invoice; D-042 "the landlord's own account") | landlord | ผู้ให้เช่า | tenant (EN) |
| Thai QR (`ResidentQrDto`, Tag 30) | Thai QR, scan to pay | QR, สแกนจ่าย | PromptPay (it is not always PromptPay) |
| slip (`SlipStatus`, D-043) | transfer slip, slip | สลิป, สลิปการโอน | proof, evidence |
| meter reading / register | reading, previous / this reading | เลขมิเตอร์ครั้งก่อน / ครั้งนี้ | counter |
| price per unit (`unitPrice`, D-022) | price per unit, ฿x per unit | ราคาต่อหน่วย, x บาท/หน่วย | rate, tariff (EN copy) |
| due date / overdue (D-100) | due in n days, due today, n days late | ครบกำหนดในอีก n วัน, ครบกำหนดวันนี้, เลยกำหนด n วัน | "overdue!" in red |
| service_request | repair / service request | แจ้งซ่อม | ticket |
| work_order | work order | งานซ่อม | job |
| announcement | announcement | ประกาศ | |
| parcel | parcel | พัสดุ | |
| invitation code | invitation code | รหัสคำเชิญ | invite token |
| consent (PDPA) | consent | ความยินยอม | |
| sign in / out | sign in / sign out | เข้าสู่ระบบ / ออกจากระบบ | log in |

Plurals use ICU (`{count, plural, one {…} other {…}}`); Thai has only `other`. Dates are Buddhist era in Thai
(`formatDate`), money is `฿1,234.50` (`formatTHB`) — never typed into copy.
