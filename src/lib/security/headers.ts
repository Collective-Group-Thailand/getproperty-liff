/**
 * Security headers for every response (CLAUDE.md, ADR-0004). Framework-free so `next.config.ts` and
 * the unit test can both import it.
 *
 * The CSP is LIFF-first: the LIFF SDK (bundled from npm, but it loads helpers and calls LINE's APIs at
 * runtime), LINE Login and the LINE CDN are the only third parties. `'unsafe-inline'` for scripts is a
 * known F0-equivalent gap — Next's inline bootstrap needs either it or a per-request nonce, and the
 * nonce arrives with `src/proxy.ts` in L1 (docs/prompts/L1-foundation.md).
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

export interface HeaderOptions {
  /** `next dev` needs `'unsafe-eval'` for React's dev tooling and a websocket for HMR. */
  dev?: boolean;
  /** Extra origins the BFF or assets live on (L1: the object-storage host for signed image URLs). */
  extraConnect?: string[];
  extraImg?: string[];
}

export function contentSecurityPolicy({ dev = false, extraConnect = [], extraImg = [] }: HeaderOptions = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...LINE_ORIGINS.script],
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
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(options: HeaderOptions = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // The camera is for service-request photos and payment slips (CameraCapture); nothing else.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
    // Resident pages are personal: never indexed.
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ...(options.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
