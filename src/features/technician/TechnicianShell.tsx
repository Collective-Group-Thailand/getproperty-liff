import { getLocale, getTranslations } from "next-intl/server";

import { isLocale } from "@/i18n/routing";
import { serverEnv } from "@/lib/env";
import { ResidentShellView } from "@/features/resident/shell/ResidentShellView";
import { SettingsMenu } from "@/features/resident/shell/SettingsMenu";

/**
 * The technician frame (R2): the same top bar, logo and settings as residents, no resident bottom nav — a technician
 * has one screen, their work orders (L4). `entry` (the sign-in page) shows the full logo above the content instead
 * of in the top bar, like the resident sign-in.
 */
export async function TechnicianShell({ children, entry = false }: { children: React.ReactNode; entry?: boolean }) {
  const [t, current] = await Promise.all([getTranslations("shell"), getLocale()]);
  const badge = serverEnv().NEXT_PUBLIC_ENV_BADGE;
  return (
    <ResidentShellView
      skipLabel={t("skipToContent")}
      navLabel={t("bottomNav")}
      navItems={[]}
      envBadge={badge ? t("envBadge", { name: badge }) : undefined}
      brand={entry ? "hero" : "header"}
      settings={<SettingsMenu locale={isLocale(current) ? current : "th"} signedIn />}
    >
      {children}
    </ResidentShellView>
  );
}
