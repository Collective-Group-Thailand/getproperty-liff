"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ACTIVE_LOCALES, LOCALES, type Locale } from "@/i18n/routing";
import { Button } from "@/ui/components/Button";
import { SegmentedControl } from "@/ui/components/SegmentedControl";
import { Sheet } from "@/ui/components/Sheet";
import { cn } from "@/ui/lib/cn";
import { useTheme } from "@/ui/theme/ThemeProvider";
import type { ThemeChoice } from "@/ui/theme/themes";

export interface SettingsSheetProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  locale: Locale;
  signedIn: boolean;
  onLanguage: (locale: Locale) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}

/** The settings sheet's content; loaded on first open (`SettingsMenuView`) to keep it out of the initial JS. */
export default function SettingsSheet({ open, setOpen, locale, signedIn, onLanguage, onSignOut }: SettingsSheetProps) {
  const t = useTranslations("shell");
  const common = useTranslations("common");
  const { choice, choices, setChoice } = useTheme();
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen} title={t("menu.title")} closeLabel={common("close")}>
      <div className="flex flex-col gap-6">
        <section aria-labelledby="settings-language" className="flex flex-col gap-2">
          <h3 id="settings-language" className="text-sm font-semibold">
            {t("language")}
          </h3>
          <ul className="grid grid-cols-2 gap-2" role="list">
            {LOCALES.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  lang={option}
                  aria-pressed={option === locale}
                  className={cn(
                    "rounded-control border-border min-h-12 w-full border px-3 text-start",
                    option === locale ? "border-primary bg-primary-subtle text-primary-subtle-fg font-semibold" : "",
                  )}
                  onClick={() => {
                    setOpen(false);
                    void onLanguage(option);
                  }}
                >
                  {t(`languageNames.${option}`)}
                </button>
              </li>
            ))}
          </ul>
          {(ACTIVE_LOCALES as readonly string[]).includes(locale) ? null : (
            <p className="text-muted text-sm">{t("languagePreview")}</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <SegmentedControl
            label={t("theme")}
            value={choice}
            onValueChange={(value) => setChoice(value as ThemeChoice)}
            options={choices.map((option) => ({ value: option, label: t(`themeChoice.${option}`) }))}
          />
        </section>

        {signedIn ? (
          <Button
            variant="secondary"
            block
            iconStart="log-out"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onSignOut();
            }}
            data-testid="sign-out"
          >
            {busy ? t("menu.signingOut") : t("menu.signOut")}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
