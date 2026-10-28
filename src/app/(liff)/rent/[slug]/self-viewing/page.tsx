import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SelfViewingBooking } from "@/features/prospect/selfViewing/SelfViewingBooking";
import { slotsOfMode } from "@/features/prospect/selfViewing/model";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireProspect } from "@/lib/auth/guards";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconKey } from "@/ui/icons/glyphs/key";

export async function generateMetadata() {
  const t = await getTranslations("prospect.selfViewing");
  return { title: t("title") };
}

/**
 * Book a self viewing (GL2, D-295): only while the platform has self-viewing on (`viewing.self.enabled`, off until the
 * insurance partner and visitor terms are settled — O-024) and the listing offers self times (own unit lock, vacant).
 * Otherwise a plain "not offered here" with the way to book a viewing with the owner instead.
 */
export default async function SelfViewingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) notFound();
  const actor = await requireProspect({ path: `/rent/${slug}/self-viewing` });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  const api = await serverApi("prospect");
  const [detail, status, slots, mine, t] = await Promise.all([
    api.GET("/v1/public/listings/{slug}", { params: { path: { slug } } }),
    api.GET("/v1/prospect/me/self-viewing"),
    api.GET("/v1/public/listings/{slug}/viewing-slots", { params: { path: { slug }, query: { days: 14 } } }),
    api.GET("/v1/prospect/enquiries"),
    getTranslations("prospect.selfViewing"),
  ]);
  if (!detail.data) {
    if (detail.response.status === 404) notFound();
    return <ProblemPage error={problemFromParsed(detail.response, detail.error)} />;
  }
  if (!status.data) return <ProblemPage error={problemFromParsed(status.response, status.error)} />;
  const listing = detail.data;
  const selfSlots = slotsOfMode(slots.data?.slots ?? [], "self");
  const offered = status.data.enabled && (slots.data?.selfViewing ?? false);
  const existing = mine.data?.find((e) => e.listing.slug === slug && e.open) ?? null;

  return (
    <div className="flex flex-col gap-5 py-5" data-testid="self-viewing" data-offered={offered}>
      <BackLink href={`/rent/${slug}`}>{t("back")}</BackLink>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{listing.title}</p>
      </div>
      {offered ? (
        <>
          <p>{t("lead")}</p>
          <SelfViewingBooking slug={slug} status={status.data} slots={selfSlots} needsConsent={existing === null} />
          {existing ? (
            <p className="text-muted text-sm">
              <Link href={`/rent/enquiries/${existing.id}`} className="text-primary font-medium underline">
                {t("existing")}
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <div className="border-border rounded-card border" data-testid="self-unavailable">
          <EmptyState
            icon={IconKey}
            title={t("unavailable.title")}
            description={status.data.enabled ? t("unavailable.listing") : t("unavailable.platform")}
            action={
              <Button asChild size="lg">
                <Link href={`/rent/${slug}?mode=book`} data-testid="self-unavailable-book">
                  {t("unavailable.action")}
                </Link>
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
