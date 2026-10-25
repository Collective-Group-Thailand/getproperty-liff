import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { ProspectPhoneSignIn } from "@/features/prospect/ProspectPhoneSignIn";
import { OAuthButtons, OAuthError } from "@/features/shared/OAuthButtons";
import { getProspect } from "@/lib/auth/actor";
import { oauthProviders } from "@/lib/auth/oauth/flow";
import { serverEnv } from "@/lib/env";
import { safeInternalPath } from "@/lib/liff/deepLink";
import { liffUrl } from "@/lib/liff/links";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { IconChat } from "@/ui/icons/glyphs/chat";

export async function generateMetadata() {
  const t = await getTranslations("prospect.rent.signIn");
  return { title: t("title") };
}

/**
 * Prospect sign-in outside LINE (L5 5.1 §4, D-255, D-283): "open in LINE" first, then an SMS code, Google or Apple.
 * Inside LINE nobody sees this page — the LIFF entry signs them in.
 */
export default async function ProspectSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wanted = safeInternalPath(typeof params.next === "string" ? params.next : "/rent/enquiries");
  const next = wanted.startsWith("/rent") ? wanted : "/rent/enquiries";
  if ((await getProspect()).status === "signed-in") redirect(next);
  const oauthError = typeof params.oauthError === "string" ? params.oauthError.slice(0, 64) : undefined;
  const t = await getTranslations("prospect.rent.signIn");
  return (
    <div className="flex flex-col gap-6 py-6" data-testid="prospect-sign-in">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      <OAuthError code={oauthError} />
      <Card as="section" padding="md" className="flex flex-col gap-3">
        <Button asChild size="lg" block iconStart={IconChat}>
          <a href={liffUrl(next, serverEnv().NEXT_PUBLIC_LIFF_ID)} data-testid="prospect-open-in-line">
            {t("openInLine")}
          </a>
        </Button>
        <p className="text-muted text-center text-sm">{t("lineHint")}</p>
      </Card>
      <p className="text-muted text-center text-sm" aria-hidden="true">
        {t("or")}
      </p>
      <Card as="section" padding="md" aria-labelledby="prospect-other-title" className="flex flex-col gap-4">
        <h2 id="prospect-other-title" className="font-semibold">
          {t("otherTitle")}
        </h2>
        <ProspectPhoneSignIn next={next} />
        <OAuthButtons providers={oauthProviders()} intent="prospect" next={next} />
      </Card>
    </div>
  );
}
