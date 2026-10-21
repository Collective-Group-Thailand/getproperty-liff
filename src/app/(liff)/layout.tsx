import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { serverEnv } from "@/lib/env";
import { publicConfigAttributes } from "@/lib/publicConfig";
import { LOGO_COLOURS } from "@/ui/brand";
import { fontClassNames } from "@/ui/fonts";
import { ThemeProvider } from "@/ui/theme/ThemeProvider";
import { readThemeChoice } from "@/ui/theme/server";
import { dataThemeAttribute } from "@/ui/theme/themes";
import { Toaster } from "@/ui/components/Toast";
import { SharedShellModules } from "@/features/resident/shell/SharedShellModules";

import { Providers } from "./providers";

import "../globals.css";
import "@/fonts/scripts.css";

/**
 * The one root layout (ADR-0004: a single zone, no host routing). It stamps what must be there before
 * the first paint — `lang` from the `gp_locale` cookie (set from `liff.getLanguage()` on first open),
 * `data-theme` from `gp_theme` (none = follow the phone), `data-zone="resident"` for the density and
 * safe-area rules, the font variables — and mounts the providers (Web Vitals, the service worker) and the toast viewport, which loads sonner with the
 * first toast (D-179). Every page is rendered per request: the proxy's CSP nonce must reach Next's scripts.
 *
 * It also hands the browser the run-time public settings (`data-liff-id`, `data-sentry-dsn`, `data-env`, read by
 * `src/lib/publicConfig.ts`): the image is built once and promoted from UAT to production (D-230), so the LIFF SDK
 * gets this environment's LIFF id from the server, never from the bundle.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return {
    title: { default: t("appTitle"), template: "%s · getproperty" },
    applicationName: "getproperty",
    robots: { index: false, follow: false },
    // The founder's logo (getproperty-web `pnpm brand`, copied byte for byte): the ICO (16/32/48) is declared 32×32 so
    // browsers that read SVG icons take the SVG mark, which turns white in a dark browser UI.
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "32x32" },
        { url: "/brand/favicon.svg", type: "image/svg+xml" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: "getproperty", statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Safe areas: draw under the notch and the home indicator, then pad with env(safe-area-inset-*).
  viewportFit: "cover",
  // The logo's house blue colours the browser UI outside LINE (address bar, installed-app title bar), as in every
  // getproperty-web zone.
  themeColor: LOGO_COLOURS.blue,
};

export default async function LiffLayout({ children }: { children: React.ReactNode }) {
  const [locale, choice] = await Promise.all([getLocale(), readThemeChoice("resident")]);
  const env = serverEnv();

  return (
    <html
      lang={locale}
      data-theme={dataThemeAttribute(choice)}
      data-zone="resident"
      className={fontClassNames}
      {...publicConfigAttributes({
        liffId: env.NEXT_PUBLIC_LIFF_ID,
        sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
        env: env.NEXT_PUBLIC_ENV_BADGE,
      })}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>
          <ThemeProvider initialChoice={choice} zone="resident">
            <Providers>
              {children}
              <Toaster />
              <SharedShellModules />
            </Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
