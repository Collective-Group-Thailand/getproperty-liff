# src/lib/pwa

`manifest.ts` — the web app manifest served at `/manifest.webmanifest` (`src/app/manifest.ts`): brand
mark icons (192, 512, maskable 512 in `public/icons`), colours from the tokens, `standalone`, portrait.
The root layout sets `viewport-fit=cover` so the safe-area insets apply on notched phones.

L1 adds the service worker (Workbox, app-shell caching only; invoices, receipts and personal data are
never cached offline) and web push (VAPID) after a meaningful action.
