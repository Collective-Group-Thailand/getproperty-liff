import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { SignIn } from "@/features/resident/auth/SignIn";
import { OAuthButtons, OAuthError } from "@/features/shared/OAuthButtons";
import { oauthProviders } from "@/lib/auth/oauth/flow";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { getActor } from "@/lib/auth/actor";
import { serverEnv } from "@/lib/env";
import { liffUrl } from "@/lib/liff/links";
import { safeInternalPath } from "@/lib/liff/deepLink";

export async function generateMetadata() {
  const t = await getTranslations("resident.auth.signIn");
  return { title: t("title") };
}

/**
 * Sign-in outside LINE (D-060): "open in LINE", a code by SMS, or Google / Apple once linked in the profile (D-255,
 * D-283). A signed-in resident goes straight on.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null);
  if ((await getActor()).status === "signed-in") redirect(next);
  const oauthError = typeof params.oauthError === "string" ? params.oauthError.slice(0, 64) : undefined;
  return (
    <ResidentShell active={null} chrome="entry">
      <SignIn
        next={next}
        lineHref={liffUrl(next, serverEnv().NEXT_PUBLIC_LIFF_ID)}
        notice={<OAuthError code={oauthError} />}
        more={<OAuthButtons providers={oauthProviders()} intent="resident" next={next} />}
      />
    </ResidentShell>
  );
}
