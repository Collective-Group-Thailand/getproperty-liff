# src/features/resident

Resident screens (audience `resident`, `/v1/resident/*`). L1: `shell/` (ResidentShell from `/v1/resident/me`:
unit + building, unit switcher, settings sheet with language/theme/sign-out, bottom nav from entitlements;
`*View` components are presentational and snapshot in Storybook), `home/` (greeting, unit card, bills card,
entitled tiles), `liff/` (the LIFF entry: init → login → exchange → deep link), `auth/` (sign-in outside LINE,
SMS code), `consent/` (PDPA, D-025), `link/` (invitation acceptance, D-061), `realtime/` (SSE → query
invalidation). L2 invoices & pay, L3 lease / usage / profile, L4 service requests, announcements, parcels.
