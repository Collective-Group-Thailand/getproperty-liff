import { getLocale, getTranslations } from "next-intl/server";

import { ResidentShellView } from "@/features/resident/shell/ResidentShellView";
import { SettingsMenu } from "@/features/resident/shell/SettingsMenu";
import { isLocale } from "@/i18n/routing";
import { serverEnv } from "@/lib/env";

/**
 * The prospect frame (L5, D-252): the same top bar, logo and language switch as residents, no resident bottom nav —
 * someone looking for a place has a listing and their enquiries, nothing else here.
 */
export async function ProspectShell({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
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
