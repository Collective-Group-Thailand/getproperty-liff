"use client";

import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";

import type { Locale } from "@/i18n/routing";
import { IconButton } from "@/ui/components/IconButton";
import { IconSettings } from "@/ui/icons/glyphs/settings";

const SettingsSheet = lazy(() => import("./SettingsSheet"));

export interface SettingsMenuViewProps {
  locale: Locale;
  signedIn: boolean;
  onLanguage: (locale: Locale) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}

/**
 * Settings in a bottom sheet (no popovers in LIFF): language (six locales, D-064), theme, sign out. Everything
 * is a 48-px target and reachable by keyboard. The sheet (Radix Dialog) loads on first open: it is on every
 * page, and the initial-JS budget is 150 KB (docs/performance-budgets.md).
 */
export function SettingsMenuView(props: SettingsMenuViewProps) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <IconButton
        icon={IconSettings}
        label={t("menu.open")}
        variant="ghost"
        aria-haspopup="dialog"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        data-testid="settings-open"
      />
      {loaded ? (
        <Suspense fallback={null}>
          <SettingsSheet {...props} open={open} setOpen={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
