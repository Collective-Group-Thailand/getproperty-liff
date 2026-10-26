import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { directionsUrl } from "@/features/prospect/model";
import { EnquiryThread } from "@/features/prospect/EnquiryThread";
import { RentRecordSharePanel } from "@/features/prospect/RentRecordSharePanel";
import { ViewingPanel } from "@/features/prospect/ViewingPanel";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireProspect } from "@/lib/auth/guards";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("prospect.rent.mine");
  return { title: t("title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One enquiry (L5 5.1 §2): the owner's answers, my viewing (change, cancel, directions), writing to the owner. */
export default async function EnquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ leadId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(leadId)) notFound();
  const actor = await requireProspect({ path: `/rent/enquiries/${leadId}` });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  const api = await serverApi("prospect");
  const result = await api.GET("/v1/prospect/enquiries/{leadId}", { params: { path: { leadId } } });
  if (!result.data) {
    if (result.response.status === 404) notFound();
    return <ProblemPage error={problemFromParsed(result.response, result.error)} />;
  }
  const enquiry = result.data;
  const rentRecord = (await api.GET("/v1/prospect/me/rent-record")).data;
  const listing = enquiry.listing.available
    ? (await api.GET("/v1/public/listings/{slug}", { params: { path: { slug: enquiry.listing.slug } } })).data
    : undefined;
  const t = await getTranslations("prospect.rent");
  const done = query.done === "sent" ? t("detail.sent") : query.done === "booked" ? t("detail.booked") : null;
  return (
    <div className="flex flex-col gap-5 py-5" data-testid="enquiry">
      <BackLink href="/rent/enquiries">{t("mine.back")}</BackLink>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{enquiry.listing.titleTh}</h1>
        <p className="text-muted text-sm">{enquiry.listing.ownerName}</p>
        {enquiry.listing.available ? (
          <Link href={`/rent/${enquiry.listing.slug}`} className="text-primary min-h-12 self-start py-3 font-medium">
            {t("detail.listing")}
          </Link>
        ) : null}
      </div>
      {done ? (
        <div data-testid="enquiry-done">
          <Callout tone="success">{done}</Callout>
        </div>
      ) : null}
      {!enquiry.open ? <Callout tone="info">{t("detail.closed")}</Callout> : null}
      {enquiry.open ? (
        <ViewingPanel enquiry={enquiry} directions={listing ? directionsUrl(listing.address, listing.geo) : null} />
      ) : null}
      {rentRecord && enquiry.open ? (
        <RentRecordSharePanel
          leadId={enquiry.id}
          record={rentRecord.record}
          share={rentRecord.shares.find((s) => s.lead?.id === enquiry.id && s.state === "live") ?? null}
        />
      ) : null}
      <EnquiryThread enquiry={enquiry} />
    </div>
  );
}
