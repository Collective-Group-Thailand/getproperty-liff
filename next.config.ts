import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security/headers";

/**
 * getproperty-liff — one zone, no host routing (ADR-0004). Static security headers (HSTS, noindex,
 * Permissions-Policy, nosniff) for every response come from `src/lib/security/headers.ts`; the CSP is built per
 * request with a nonce in `src/proxy.ts` (L1).
 */
const nextConfig: NextConfig = {
  // CLAUDE.md is hand-written project documentation; Next 16 would otherwise overwrite it with
  // generated agent rules.
  agentRules: false,
  poweredByHeader: false,
  // Always defined, so the bundler inlines it and drops the branch it does not take: with "0" the fake
  // LIFF (src/lib/liff/fake.ts) is not in the bundle at all (`pnpm release:hygiene` checks).
  env: { NEXT_PUBLIC_LIFF_MOCK: process.env.NEXT_PUBLIC_LIFF_MOCK === "1" ? "1" : "0" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ dev: process.env.NODE_ENV !== "production" }) }];
  },
};

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  experimental: {
    // D-179: every catalog under src/i18n/messages is compiled from ICU to a compact AST at build time and the
    // client gets next-intl's format-only runtime — no ICU parser in any bundle. The JSON files stay the source
    // (tests, Storybook and `messages.test.ts` read them as written); the my/km/lo/zh → en fallback merges the
    // compiled values key by key as before.
    messages: { path: "./src/i18n/messages", format: "json", locales: "infer", precompile: true },
  },
});

// `pnpm analyze` (ANALYZE=true, webpack build): treemaps of every client chunk in `.next/analyze/`.
// The Turbopack build that ships has its own viewer, `pnpm exec next analyze`.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true", openAnalyzer: false });

export default withBundleAnalyzer(withNextIntl(nextConfig));
