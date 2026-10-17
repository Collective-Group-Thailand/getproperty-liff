import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { fontClassNames } from "@/ui/fonts";
import { ThemeProvider } from "@/ui/theme/ThemeProvider";
import { readThemeChoice } from "@/ui/theme/server";
import { dataThemeAttribute } from "@/ui/theme/themes";
import { oklchToHex } from "@/ui/tokens/color";
import { THEMES } from "@/ui/tokens/semantic";

import { DeferredToaster } from "@/features/shared/DeferredToaster";

import { Providers } from "./providers";

import "../globals.css";

/**
 * The one root layout (ADR-0004: a single zone, no host routing). It stamps what must be there before
 * the first paint — `lang` from the `gp_locale` cookie (set from `liff.getLanguage()` on first open),
 * `data-theme` from `gp_theme` (none = follow the phone), `data-zone="resident"` for the density and
 * safe-area rules, the font variables — and mounts the providers (TanStack Query, Web Vitals, the service
 * worker). Every page is rendered per request: the proxy's CSP nonce must reach Next's scripts.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return {
    title: { default: t("appTitle"), template: "%s · getproperty" },
    applicationName: "getproperty",
    robots: { index: false, follow: false },
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "getproperty", statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Safe areas: draw under the notch and the home indicator, then pad with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: oklchToHex(THEMES.light.bg) },
    { media: "(prefers-color-scheme: dark)", color: oklchToHex(THEMES.dark.bg) },
  ],
};

export default async function LiffLayout({ children }: { children: React.ReactNode }) {
  const [locale, choice] = await Promise.all([getLocale(), readThemeChoice("resident")]);

  return (
    <html
      lang={locale}
      data-theme={dataThemeAttribute(choice)}
      data-zone="resident"
      className={fontClassNames}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>
          <ThemeProvider initialChoice={choice} zone="resident">
            <Providers>
              {children}
              <DeferredToaster />
            </Providers>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
