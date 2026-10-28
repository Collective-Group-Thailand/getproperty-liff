# G — Listing & Growth (module E) · getproperty-liff

> อ่าน `CLAUDE.md`, `00-master-plan.md`, `docs/decisions.md`, `docs/contract/api-conventions.md`, `docs/prompts/design-system.md`, `docs/prompts/G-growth-liff.md` · ทำทีละ step ต่อ 1 session · Plan Mode ทุกครั้ง

---

You are a senior frontend engineer on **`getproperty-liff`** (residents, prospects, technicians in LINE). Founder decisions in `getproperty-api/docs/prompts/G-README.md` are requirements. Extend B7 screens (prospect interest, e-KYC, rent record share). Budget ≤ 180 KB per page (`/profile` has no headroom — new code loads lazily), six languages for resident/prospect copy (th, en, my, km, lo, zh), consent screens never pre-ticked.

## GL1 — Marketing consent & preferences (after api G6)
Separate "รับห้องแนะนำ" consent with plain-language purpose and profiling note, preferences (areas, budget, type, move-in window, language), withdraw in one tap, history of what was sent; quiet hours respected.

## GL2 — Self-viewing for prospects (after api G7)
Book a slot, identity check (B7.10 flow), receive the door code only inside the window (fetched on tap, never cached), arrive/leave confirmation, report an issue; accompanied viewings shown with the agent's contact.

## GL3 — Contracts & renewals for residents (after api G3)
Read and e-sign any contract kind from the library (reservation, lease, addendum), renewal offer with accept/decline (decline leads to the move-out notice), legal-review and disclaimer text shown as the API returns it.

## GL4 — Relocation & reviews (after api G8, G9)
On move-out notice: destination area + "แนะนำห้องในเครือข่าย" (consented), share rent record with a new landlord in one step; verified review of the building after move-out or after 3 months of tenure.

After each step: PROGRESS, contract adopted, e2e (six locales on new screens), Lighthouse within 180 KB, commit.
