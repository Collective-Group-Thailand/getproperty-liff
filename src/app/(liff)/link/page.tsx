import { getTranslations } from "next-intl/server";

import { LinkInvitation } from "@/features/resident/link/LinkInvitation";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { requireResident } from "@/lib/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("resident.link");
  return { title: t("title") };
}

/**
 * Invitation acceptance (D-061): the operator's invite QR/SMS opens `liff.line.me/<id>/link?code=…`, the LIFF
 * entry signs the resident in and lands here. The required consents come first (`POST /v1/resident/link` answers
 * 409 `consent.required` otherwise, D-025): the guard sends a first-time resident to the consent screen, which
 * brings them back here with the code.
 */
export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code.trim().toUpperCase().slice(0, 32) : "";
  const self = code ? `/link?code=${encodeURIComponent(code)}` : "/link";
  await requireResident({ path: self });
  return (
    <ResidentShell active={null} chrome="minimal">
      <LinkInvitation initialCode={code} />
    </ResidentShell>
  );
}
