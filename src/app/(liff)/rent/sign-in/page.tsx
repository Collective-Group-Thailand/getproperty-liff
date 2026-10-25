import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { getProspect } from "@/lib/auth/actor";
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
 * Prospect sign-in outside LINE (L5 5.1 §4): "open in LINE" for now; phone, Google and Apple join with D-255's OAuth
 * clients (B7.8). Inside LINE nobody sees this page — the LIFF entry signs them in.
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
  const t = await getTranslations("prospect.rent.signIn");
  return (
    <div className="flex flex-col gap-6 py-6" data-testid="prospect-sign-in">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      <Card as="section" padding="md" className="flex flex-col gap-3">
        <Button asChild size="lg" block iconStart={IconChat}>
          <a href={liffUrl(next, serverEnv().NEXT_PUBLIC_LIFF_ID)} data-testid="prospect-open-in-line">
            {t("openInLine")}
          </a>
        </Button>
        <p className="text-muted text-center text-sm">{t("lineHint")}</p>
      </Card>
      <p className="text-muted text-center text-sm">{t("soon")}</p>
    </div>
  );
}
