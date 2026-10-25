import { getLocale, getTranslations } from "next-intl/server";

import { ResidentShellView } from "@/features/resident/shell/ResidentShellView";
import { SettingsMenu } from "@/features/resident/shell/SettingsMenu";
import { isLocale } from "@/i18n/routing";
import { serverEnv } from "@/lib/env";

/**
 * The landlord frame (L5 5.3, D-251): the app's top bar, logo and language switch, no resident bottom nav — one page
 * of today's items and the enquiries behind them; the console on the web does the rest.
 */
export async function LandlordShell({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
  const [t, current] = await Promise.all([getTranslations("shell"), getLocale()]);
  const badge = serverEnv().NEXT_PUBLIC_ENV_BADGE;
  return (
    <ResidentShellView
      skipLabel={t("skipToContent")}
      navLabel={t("bottomNav")}
      navItems={[]}
      envBadge={badge ? t("envBadge", { name: badge }) : undefined}
      brand="header"
      settings={<SettingsMenu locale={isLocale(current) ? current : "th"} signedIn={signedIn} />}
    >
      {children}
    </ResidentShellView>
  );
}
