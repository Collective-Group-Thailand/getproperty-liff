import { getLocale, getTranslations } from "next-intl/server";

import { isLocale } from "@/i18n/routing";
import { ResidentShellView } from "@/features/resident/shell/ResidentShellView";
import { SettingsMenu } from "@/features/resident/shell/SettingsMenu";

/**
 * The technician frame (R2): the same top bar and settings as residents, no resident bottom nav — a technician
 * has one screen, their work orders (L4).
 */
export async function TechnicianShell({ children }: { children: React.ReactNode }) {
  const [t, current] = await Promise.all([getTranslations("shell"), getLocale()]);
  return (
    <ResidentShellView
      skipLabel={t("skipToContent")}
      navLabel={t("bottomNav")}
      navItems={[]}
      settings={<SettingsMenu locale={isLocale(current) ? current : "th"} signedIn />}
    >
      {children}
    </ResidentShellView>
  );
}
