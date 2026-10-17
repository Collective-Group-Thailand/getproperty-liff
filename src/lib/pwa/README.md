# src/lib/pwa

- `manifest.ts` — the web app manifest (`/manifest.webmanifest`): brand icons, token colours, `standalone`.
- Service worker — `src/sw/sw.ts` bundled by `pnpm sw` (runs before `next build`) into `public/sw.js`
  (git-ignored), registered after load in production (`register.ts`). **App shell only** (`cachePolicy.ts`):
  hashed static assets, fonts, icons and `public/offline.html`; pages, `/bff/*` (invoices, receipts, personal
  data) and other origins are never cached. Navigations fall back to the offline page.
- Web push — `push.ts`: VAPID subscription offered after a meaningful action (first payment, L2), never inside
  LINE; registration endpoint is CONTRACT-REQUEST #5. The SW shows the notification and opens its in-app path.
