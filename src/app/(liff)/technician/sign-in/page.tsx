import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { TechnicianShell } from "@/features/technician/TechnicianShell";
import { TechnicianSignIn } from "@/features/technician/TechnicianSignIn";
import { getTechnician } from "@/lib/auth/actor";
import { safeInternalPath } from "@/lib/liff/deepLink";
import { serverEnv } from "@/lib/env";
import { liffUrl } from "@/lib/liff/links";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("technician.auth");
  return { title: t("title") };
}

/** Technician sign-in outside LINE (L4 4.4 §1): open in LINE, or an SMS code. A signed-in technician goes on. */
export default async function TechnicianSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const wanted = safeInternalPath(typeof params.next === "string" ? params.next : "/technician");
  const next = wanted.startsWith("/technician") ? wanted : "/technician";
  if ((await getTechnician()).status === "signed-in") redirect(next);
  return (
    <TechnicianShell entry>
      <TechnicianSignIn next={next} lineHref={liffUrl(next, serverEnv().NEXT_PUBLIC_LIFF_ID)} />
    </TechnicianShell>
  );
}
