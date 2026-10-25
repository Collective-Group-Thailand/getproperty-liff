import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ContactPanel } from "@/features/prospect/ContactPanel";
import { ListingSummary } from "@/features/prospect/ListingSummary";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { serverApi } from "@/lib/api/server";
import { problemFromParsed } from "@/lib/api/problem";
import { getProspect } from "@/lib/auth/actor";
import { prospectSignInPath } from "@/lib/auth/redirects";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { IconChat } from "@/ui/icons/glyphs/chat";

export async function generateMetadata() {
  const t = await getTranslations("prospect.rent.signIn");
  return { title: t("title") };
}

/**
 * A listing someone opened from the rental search (L5 5.1 §1, D-252): what it is, then ask the owner or book a
 * viewing. Signed out → one button to sign in with LINE that brings them back here.
 */
export default async function RentListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) notFound();
  const api = await serverApi("prospect");
  const detail = await api.GET("/v1/public/listings/{slug}", { params: { path: { slug } } });
  if (!detail.data) {
    if (detail.response.status === 404) notFound();
    return <ProblemPage error={problemFromParsed(detail.response, detail.error)} />;
  }
  const listing = detail.data;
  const [t, actor] = await Promise.all([getTranslations("prospect.rent"), getProspect()]);
  const mode = query.mode === "book" ? "book" : "ask";
  const here = `/rent/${slug}${mode === "book" ? "?mode=book" : ""}`;

  let panel: React.ReactNode;
  if (actor.status === "signed-in") {
    const [slots, mine] = await Promise.all([
      api.GET("/v1/public/listings/{slug}/viewing-slots", { params: { path: { slug }, query: { days: 14 } } }),
      api.GET("/v1/prospect/enquiries"),
    ]);
    const existing = mine.data?.find((e) => e.listing.slug === slug && e.open) ?? null;
    panel = (
      <ContactPanel slug={slug} slots={slots.data?.slots ?? []} existingId={existing?.id ?? null} initialMode={mode} />
    );
  } else {
    const href = prospectSignInPath(here, (await headers()).get("user-agent"));
    panel = (
      <Card as="section" padding="md" className="flex flex-col gap-3" data-testid="prospect-signin-card">
        <h2 className="font-semibold">{t("signIn.title")}</h2>
        <p className="text-muted text-sm">{t("signIn.lead")}</p>
        <Button asChild size="lg" block iconStart={IconChat}>
          <a href={href} data-testid="prospect-signin">
            {t("signIn.action")}
          </a>
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-5" data-testid="prospect-rent">
      <ListingSummary listing={listing} />
      {panel}
      <Callout tone="warning">{t("safety")}</Callout>
    </div>
  );
}
