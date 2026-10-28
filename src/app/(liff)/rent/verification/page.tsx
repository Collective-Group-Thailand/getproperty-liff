import { getLocale, getTranslations } from "next-intl/server";

import { safeNext } from "@/features/prospect/selfViewing/model";
import { BackLink } from "@/features/shared/BackLink";
import { IdentityVerificationPanel } from "@/features/shared/IdentityVerificationPanel";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { isLocale } from "@/i18n/routing";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireProspect } from "@/lib/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("verification");
  return { title: t("title") };
}

/**
 * Verify my identity before I enquire (D-267, O-021): owners see the badge on my enquiries. Self-viewing (GL2,
 * D-295) sends people here with `?next=/rent/{slug}/self-viewing` — the back link then returns to that booking.
 */
export default async function ProspectVerificationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  const actor = await requireProspect({
    path: next ? `/rent/verification?next=${encodeURIComponent(next)}` : "/rent/verification",
  });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  const [t, sv, current] = await Promise.all([
    getTranslations("prospect.rent.mine"),
    getTranslations("prospect.selfViewing"),
    getLocale(),
  ]);
  const api = await serverApi("prospect");
  const { data, error, response } = await api.GET("/v1/prospect/me/identity-verification");
  return (
    <div className="flex flex-col gap-2 py-3">
      {next ? (
        <BackLink href={next}>{sv("backToBooking")}</BackLink>
      ) : (
        <BackLink href="/rent/enquiries">{t("title")}</BackLink>
      )}
      {data ? (
        <IdentityVerificationPanel audience="prospect" status={data} locale={isLocale(current) ? current : "th"} />
      ) : (
        <ProblemPage error={problemFromParsed(response, error)} />
      )}
    </div>
  );
}
