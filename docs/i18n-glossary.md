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
| service_request | repair / service request | แจ้งซ่อม | ticket |
| work_order | work order | งานซ่อม | job |
| announcement | announcement | ประกาศ | |
| parcel | parcel | พัสดุ | |
| invitation code | invitation code | รหัสคำเชิญ | invite token |
| consent (PDPA) | consent | ความยินยอม | |
| sign in / out | sign in / sign out | เข้าสู่ระบบ / ออกจากระบบ | log in |

Plurals use ICU (`{count, plural, one {…} other {…}}`); Thai has only `other`. Dates are Buddhist era in Thai
(`formatDate`), money is `฿1,234.50` (`formatTHB`) — never typed into copy.
