/**
 * Security headers (CLAUDE.md, ADR-0004). Framework-free so `src/proxy.ts`, `next.config.ts` and the unit tests
 * share it.
 *
 * The CSP is built **per request with a nonce** by the proxy (L1): scripts run only when they carry the nonce
 * Next stamps on its own inline bootstrap and chunks (`'strict-dynamic'` then trusts what those load) — no
 * `'unsafe-inline'` for scripts. Styles keep `'unsafe-inline'` (React/Radix set inline `style` attributes, which
 * nonces cannot cover). Third parties are LINE (the LIFF SDK talks to LINE at runtime; LINE Login), the object
 * storage host of signed images and presigned uploads, and Sentry's ingest host when error reporting is on.
 */

/** LINE origins the LIFF SDK and LINE Login talk to. */
export const LINE_ORIGINS = {
  /** The SDK's own script and its runtime helpers. */
  script: ["https://static.line-scdn.net"],
  /** LIFF / LINE Login / profile APIs and the SDK's message bridge. */
  connect: [
    "https://api.line.me",
    "https://access.line.me",
    "https://liffsdk.line-scdn.net",
    "https://*.line-apps.com",
  ],
  /** Profile pictures and LINE CDN images. */
  img: ["https://profile.line-scdn.net", "https://*.line-scdn.net", "https://obs.line-apps.com"],
  /** LINE Login's authorisation page. */
  form: ["https://access.line.me"],
  /** LIFF URLs (`liff.line.me`) and the in-app browser on LINE desktop may frame the endpoint. */
  frameAncestors: ["https://liff.line.me", "https://*.line.me"],
} as const;

export interface CspOptions {
  /** The per-request nonce (base64). Without one, no inline script may run at all. */
  nonce?: string;
  /** `next dev` needs `'unsafe-eval'` for React's dev tooling and a websocket for HMR. */
  dev?: boolean;
  /** Extra origins: object storage (signed images, presigned PUTs), Sentry ingest. */
  extraConnect?: string[];
  extraImg?: string[];
}

export function contentSecurityPolicy({
  nonce,
  dev = false,
  extraConnect = [],
  extraImg = [],
}: CspOptions = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      ...(nonce ? [`'nonce-${nonce}'`, "'strict-dynamic'"] : []),
      ...(dev ? ["'unsafe-eval'"] : []),
      ...LINE_ORIGINS.script,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...LINE_ORIGINS.img, ...extraImg],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...LINE_ORIGINS.connect, ...extraConnect, ...(dev ? ["ws:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'self'", ...LINE_ORIGINS.frameAncestors],
    "form-action": ["'self'", ...LINE_ORIGINS.form],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${[...new Set(values)].join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** A 128-bit random nonce, base64-encoded (CSP3 `nonce-source`). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The origin of a URL, or nothing for an unset/invalid value. */
export function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Headers for every response; the CSP is added per request by the proxy (it needs the nonce). */
export function securityHeaders({ dev = false }: { dev?: boolean } = {}): { key: string; value: string }[] {
  return [
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // The camera is for service-request photos and payment slips (CameraCapture); nothing else.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
    // Resident pages are personal: never indexed.
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
