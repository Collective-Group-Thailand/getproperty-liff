import { useTranslations } from "next-intl";

import { EmptyAction } from "@/features/shared/EmptyAction";
import { Screen, ScreenHeader } from "@/features/shared/Screen";
import type { Locale } from "@/i18n/routing";
import type { OpenableGate } from "@/lib/api/types";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconCar } from "@/ui/icons/glyphs/car";

import { OpenBarrier } from "./OpenBarrier";

/** The barrier on its own screen; an estate that does not allow it, or a household without a car, says why. */
export function OpenBarrierScreen({ gates, locale }: { gates: OpenableGate[]; locale: Locale }) {
  const t = useTranslations("resident.visitors.open");
  const usable = gates.filter((g) => g.enabled && g.vehicles.length > 0);
  return (
    <Screen testId="open-barrier-screen">
      <ScreenHeader flush title={t("title")} lede={usable.length ? t("lede") : undefined} />
      {usable.length ? (
        <OpenBarrier gates={usable} locale={locale} />
      ) : (
        <EmptyState
          variant="card"
          icon={IconCar}
          title={gates.length && gates.every((g) => !g.enabled) ? t("disabled") : t("noCarsTitle")}
          description={gates.length && gates.every((g) => !g.enabled) ? t("disabledBody") : t("noCars")}
          action={
            <EmptyAction
              href={gates.some((g) => g.enabled) ? "/visitors/cars" : "/visitors"}
              label={gates.some((g) => g.enabled) ? t("addCar") : t("back")}
            />
          }
        />
      )}
    </Screen>
  );
}
