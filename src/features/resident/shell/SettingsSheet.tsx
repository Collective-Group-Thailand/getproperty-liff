"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ACTIVE_LOCALES, LOCALES, type Locale } from "@/i18n/routing";
import { NETWORK_UNAVAILABLE, toApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { SegmentedControl } from "@/ui/components/SegmentedControl";
// eslint-disable-next-line no-restricted-imports -- this module is itself loaded on first open (SettingsMenuView, D-179)
import { Sheet } from "@/ui/components/Sheet";
import { cn } from "@/ui/lib/cn";
import { useTheme } from "@/ui/theme/ThemeProvider";
import type { ThemeChoice } from "@/ui/theme/themes";
import { IconLogOut } from "@/ui/icons/glyphs/log-out";

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
  const errors = useTranslations("errors");
  // "network" or "generic" — the copy of `errors.*` (the full ProblemCallout would reshape the shell's chunks, D-179).
  const [error, setError] = useState<"network" | "generic" | null>(null);

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
            iconStart={IconLogOut}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              let leaving = false;
              try {
                await onSignOut();
                leaving = true;
              } catch (caught) {
                // No connection: the session is still there — say so and let the resident try again (review M1).
                setError(toApiError(caught).code === NETWORK_UNAVAILABLE ? "network" : "generic");
              } finally {
                if (!leaving) setBusy(false);
              }
            }}
            data-testid="sign-out"
          >
            {busy ? t("menu.signingOut") : t("menu.signOut")}
          </Button>
        ) : null}
        {error ? (
          <div role="alert" data-testid="sign-out-error">
            <Callout tone="danger" title={errors(`${error}.title`)}>
              {errors(`${error}.body`)}
            </Callout>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
