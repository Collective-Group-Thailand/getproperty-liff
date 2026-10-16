# src/lib/liff — the LIFF wrapper

Everything that touches the LINE Front-end Framework goes through here; ESLint refuses
`import "@line/liff"` anywhere else and `window.open` everywhere (CLAUDE.md, LIFF-first).

| File          | What                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`    | `LiffClient` — the slice of the SDK the app uses (add a method here before using it)                                                                                                           |
| `client.ts`   | `getLiff()` (real SDK, or the fake when `NEXT_PUBLIC_LIFF_MOCK=1` — inlined at build, so the other branch is dropped), `openExternal()` (`liff.openWindow`), `liffId()`, `setLiffForTesting()` |
| `fake.ts`     | `createFakeLiff()` — in-memory LIFF that records calls; tests, Playwright, `pnpm dev:mock`. Never in a production build (`release-hygiene`)                                                    |
| `deepLink.ts` | `resolveLiffState()` — `?liff.state=` → a known in-app path or `/`; never an open redirect                                                                                                     |
| `entry.ts`    | `runLiffEntry()` — init → login → deep link (L0); L1 adds the id-token exchange via the BFF                                                                                                    |

L1 adds: id-token exchange (`POST /bff/auth/line` → `/v1/auth/resident/line` → httpOnly cookies; the
token is never stored in JS), account linking with the invitation code from `liff.state`, the consent
screen, `liff.shareTargetPicker` helpers, and the magic-link fallback outside LINE.
