# src/i18n

- `routing.ts` — the six resident locales (D-064): `th` (default) and `en` complete; `my`, `km`, `lo`,
  `zh` scaffolded with English fallback until L4. Locale from the `gp_locale` cookie (no URL segment).
- `request.ts` — next-intl request config: cookie → locale → messages, `Asia/Bangkok`.
- `messages/<locale>/{shared,resident,technician}.json` — Thai written first and reviewed against
  `docs/ui/voice-and-tone.md`; English follows; other locales merge over English key by key.
- `format.ts` — `formatTHB`, `formatUnits`, `formatDate` (Buddhist era)… **copied from getproperty-web**
  (`docs/shared-copies.md`); they take the API's decimal strings and ISO dates and never do arithmetic.
