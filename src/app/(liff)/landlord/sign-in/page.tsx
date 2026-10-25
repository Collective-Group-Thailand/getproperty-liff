import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { ExternalLinkButton } from "@/features/shared/ExternalLinkButton";
import { getLandlord } from "@/lib/auth/actor";
import { serverEnv } from "@/lib/env";
import { safeInternalPath } from "@/lib/liff/deepLink";
import { liffUrl } from "@/lib/liff/links";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { IconChat } from "@/ui/icons/glyphs/chat";

export async function generateMetadata() {
  const t = await getTranslations("landlord.home.signIn");
  return { title: t("title") };
}

/**
 * The landlord's way in outside LINE, and the answer when LINE is not linked yet (L5 5.3, D-255): the quick actions
 * live in LINE with the LINE identity linked in the web console; everything else is the console itself.
 */
export default async function LandlordSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wanted = safeInternalPath(typeof params.next === "string" ? params.next : "/landlord");
  const next = wanted.startsWith("/landlord") ? wanted : "/landlord";
  const notLinked = params.reason === "not_linked";
  if (!notLinked && (await getLandlord()).status === "signed-in") redirect(next);
  const t = await getTranslations("landlord.home");
  const env = serverEnv();
  return (
    <div className="flex flex-col gap-6 py-6" data-testid="landlord-sign-in">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("signIn.title")}</h1>
        <p className="text-muted">{t("signIn.lead")}</p>
      </div>
      {notLinked ? (
        <div data-testid="landlord-not-linked">
          <Callout tone="warning" title={t("signIn.notLinkedTitle")}>
            {t("signIn.notLinkedBody")}
          </Callout>
        </div>
      ) : null}
      <Card as="section" padding="md" className="flex flex-col gap-3">
        <Button asChild size="lg" block iconStart={IconChat}>
          <a href={liffUrl(next, env.NEXT_PUBLIC_LIFF_ID)} data-testid="landlord-open-in-line">
            {t("signIn.openInLine")}
          </a>
        </Button>
        {env.OWNER_CONSOLE_URL ? (
          <ExternalLinkButton href={env.OWNER_CONSOLE_URL}>{t("openConsole")}</ExternalLinkButton>
        ) : null}
      </Card>
    </div>
  );
}
