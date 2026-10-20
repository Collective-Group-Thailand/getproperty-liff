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

## Myanmar, Khmer, Lao, Simplified Chinese (L4 4.3, D-064)

Every shared and resident namespace exists in `my`, `km`, `lo` and `zh` (`messages.test.ts` fails on a missing or
extra key); the technician namespace stays English there (technicians are briefed in Thai or English). The copy is a
machine-translated base reviewed for tone — plain, polite, second person, short labels — with the words below used
the same way everywhere. Numbers, money and dates are never typed into copy: they come from the formatters (these
locales use the en-GB patterns of `format.ts`, Gregorian years).

| Concept | English | Myanmar (`my`) | Khmer (`km`) | Lao (`lo`) | Chinese (`zh`) |
|---|---|---|---|---|---|
| unit | unit | အခန်း | បន្ទប់ | ຫ້ອງ | 房间 |
| building / office | building / building office | အဆောက်အအုံ / အဆောက်အအုံရုံး | អគារ / ការិយាល័យអគារ | ອາຄານ / ຫ້ອງການອາຄານ | 楼宇 / 楼宇管理处 |
| invoice | bill | ဘေလ် | វិក្កយបត្រ | ບິນ | 账单 |
| receipt | receipt | ငွေလက်ခံဖြတ်ပိုင်း | បង្កាន់ដៃ | ໃບຮັບເງິນ | 收据 |
| slip | transfer slip | စလစ် | ស្លីប (never បង្កាន់ដៃ — that is the receipt) | ສະລິບ | 凭证 |
| Thai QR | QR | QR | QR | QR | 二维码 |
| lease | lease | အိမ်ငှားစာချုပ် | កិច្ចសន្យាជួល | ສັນຍາເຊົ່າ | 租约 |
| service_request | service request | ပြုပြင်ရန် တောင်းဆို | ស្នើជួសជុល | ແຈ້ງສ້ອມ | 报修 |
| technician | technician | ပြုပြင်ရေးဆရာ | ជាង | ຊ່າງ | 维修师傅 |
| announcement | announcement | ကြေညာချက် | សេចក្តីជូនដំណឹង | ປະກາດ | 公告 |
| parcel / pick-up code | parcel / pick-up code | ပါဆယ် / ယူရန်ကုဒ် | កញ្ចប់អីវ៉ាន់ / លេខកូដយកកញ្ចប់ | ພັດສະດຸ / ລະຫັດຮັບພັດສະດຸ | 包裹 / 取件码 |
| facility booking | book a facility | အများသုံးနေရာ ကြိုတင်မှာ | កក់កន្លែងរួម | ຈອງພື້ນທີ່ສ່ວນກາງ | 预约公共设施 |
| house rules | house rules | အဆောက်အအုံ စည်းမျဉ်း | បទបញ្ជាអគារ | ລະບຽບອາຄານ | 楼宇规定 |
| door code | door code | တံခါးကုဒ် | លេខកូដទ្វារ | ລະຫັດປະຕູ | 门禁密码 |
| rating | rating | အဆင့် | ការវាយតម្លៃ | ຄະແນນ | 评分 |

Scripts are drawn by self-hosted Noto Sans Myanmar / Khmer / Lao / SC subsets (`src/fonts`, `pnpm fonts:scripts`);
`src/fonts/fonts.test.ts` fails when a character of the copy has no glyph. A change to the `zh` copy may need
`pnpm fonts:scripts` (CI runs `fonts:scripts:check`).
