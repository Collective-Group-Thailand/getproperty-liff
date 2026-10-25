import { getTranslations } from "next-intl/server";

import { ExternalLinkButton } from "@/features/shared/ExternalLinkButton";
import { Callout } from "@/ui/components/Callout";

/** An operator whose organisation is not a landlord's: the console on the web is theirs (L5 5.3). */
export async function NotLandlord({ consoleUrl }: { consoleUrl: string | undefined }) {
  const t = await getTranslations("landlord.home");
  return (
    <div className="flex flex-col gap-4 py-6" data-testid="landlord-not-landlord">
      <Callout tone="info" title={t("signIn.notLandlordTitle")}>
        {t("signIn.notLandlordBody")}
      </Callout>
      {consoleUrl ? <ExternalLinkButton href={consoleUrl}>{t("openConsole")}</ExternalLinkButton> : null}
    </div>
  );
}
