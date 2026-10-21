import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { SignIn } from "@/features/resident/auth/SignIn";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { getActor } from "@/lib/auth/actor";
import { serverEnv } from "@/lib/env";
import { liffUrl } from "@/lib/liff/links";
import { safeInternalPath } from "@/lib/liff/deepLink";

export async function generateMetadata() {
  const t = await getTranslations("resident.auth.signIn");
  return { title: t("title") };
}

/** Sign-in outside LINE (D-060): "open in LINE", or a code by SMS. A signed-in resident goes straight on. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null);
  if ((await getActor()).status === "signed-in") redirect(next);
  return (
    <ResidentShell active={null} chrome="entry">
      <SignIn next={next} lineHref={liffUrl(next, serverEnv().NEXT_PUBLIC_LIFF_ID)} />
    </ResidentShell>
  );
}
