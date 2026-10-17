# src/i18n

- `routing.ts` — the six resident locales (D-064): `th` (default) and `en` complete; `my`, `km`, `lo`, `zh`
  scaffolded (empty files) with English fallback until L4. Locale from the `gp_locale` cookie (no URL segment);
  first written from `liff.getLanguage()`, then from `/v1/resident/me.language` at sign-in, then by the switcher
  (which also tells the API, CONTRACT-REQUEST #3).
- `request.ts` — next-intl request config: cookie → locale → messages, `Asia/Bangkok`.
- `messages/<locale>/<namespace>/<feature>.json` — per feature: `shared/*` at the root (`shell`, `common`,
  `errors`, `status`, `brand`), `resident/*` under `resident.<feature>`, `technician/*` under
  `technician.<feature>`. `MESSAGE_FILES` in `messages.ts` is the manifest. ICU messages (plurals); Thai written
  first and reviewed against `docs/ui/voice-and-tone.md`; glossary `docs/i18n-glossary.md` (D-151 terms).
  `messages.test.ts`: same keys th/en, valid ICU with the same arguments, no "tenant" for residents in English.
- `format.ts` — `formatTHB`, `formatUnits`, `formatDate` (Buddhist era)… **copied from getproperty-web**
  (`docs/shared-copies.md`); they take the API's decimal strings and ISO dates and never do arithmetic.
