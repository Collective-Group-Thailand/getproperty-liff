import { getTranslations } from "next-intl/server";

import { OtpVerifyClient } from "@/features/resident/auth/OtpVerifyClient";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { safeInternalPath } from "@/lib/liff/deepLink";

export async function generateMetadata() {
  const t = await getTranslations("resident.auth.otp");
  return { title: t("title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The SMS code page — also where the SMS link lands (`PUBLIC_RESIDENT_APP_URL/auth/otp`, getproperty-api). */
export default async function OtpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const challenge = typeof params.c === "string" && UUID.test(params.c) ? params.c : null;
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null);
  return (
    <ResidentShell active={null} chrome="entry">
      <OtpVerifyClient challengeFromUrl={challenge} next={next} />
    </ResidentShell>
  );
}
