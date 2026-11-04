import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { directionsUrl } from "@/features/prospect/model";
import { EnquiryThread } from "@/features/prospect/EnquiryThread";
import { LazyRentRecordSharePanel } from "@/features/prospect/LazyRentRecordSharePanel";
import { ViewingPanel } from "@/features/prospect/ViewingPanel";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { FACT_ROWS_CLASS, Screen, ScreenHeader } from "@/features/shared/Screen";
import { formatDate, formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireProspect } from "@/lib/auth/guards";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { DescriptionList, type DescriptionItem } from "@/ui/components/DescriptionList";
import { IconArchive } from "@/ui/icons/glyphs/archive";
import { IconChat } from "@/ui/icons/glyphs/chat";

export async function generateMetadata() {
  const t = await getTranslations("prospect.rent.mine");
  return { title: t("title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One enquiry (L5 5.1 §2) in the record frame (redesign G2): the listing as the title with whether the enquiry is still
 * open, what I told the owner, my viewing (change, cancel, directions), the conversation, then the listing link.
 */
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
  const [t, sv, current] = await Promise.all([
    getTranslations("prospect.rent"),
    getTranslations("prospect.selfViewing"),
    getLocale(),
  ]);
  const done =
    query.done === "sent"
      ? t("detail.sent")
      : query.done === "booked"
        ? t("detail.booked")
        : query.done === "left"
          ? sv("panel.left")
          : null;
  const locale = isLocale(current) ? current : "th";
  const facts: DescriptionItem[] = [
    { id: "owner", term: t("detail.fact.owner"), description: enquiry.listing.ownerName },
    { id: "sent", term: t("detail.fact.sent"), description: formatDateTime(enquiry.createdAt, locale) },
    ...(enquiry.moveInDate
      ? [{ id: "moveIn", term: t("detail.fact.moveIn"), description: formatDate(enquiry.moveInDate, locale) }]
      : []),
    ...(enquiry.termMonths
      ? [
          {
            id: "term",
            term: t("detail.fact.term"),
            description: t("detail.termValue", { months: enquiry.termMonths }),
          },
        ]
      : []),
    ...(enquiry.occupants
      ? [
          {
            id: "occupants",
            term: t("detail.fact.occupants"),
            description: t("detail.occupantsValue", { count: enquiry.occupants }),
          },
        ]
      : []),
  ];
  return (
    <Screen testId="enquiry" data-open={enquiry.open || undefined}>
      <ScreenHeader
        back={{ href: "/rent/enquiries", label: t("mine.back") }}
        title={enquiry.listing.titleTh}
        lede={enquiry.listing.ownerName}
        status={
          <span data-testid="enquiry-status">
            {enquiry.open ? (
              <Badge tone="info" icon={IconChat}>
                {t("mine.open")}
              </Badge>
            ) : (
              <Badge tone="neutral" icon={IconArchive}>
                {t("mine.closed")}
              </Badge>
            )}
          </span>
        }
      />
      {done ? (
        <div data-testid="enquiry-done">
          <Callout tone="success">{done}</Callout>
        </div>
      ) : null}
      {!enquiry.open ? <Callout tone="info">{t("detail.closed")}</Callout> : null}
      <Card as="section" padding="md" aria-label={t("detail.fact.title")} data-testid="enquiry-facts">
        <DescriptionList layout="rows" items={facts} className={FACT_ROWS_CLASS} />
      </Card>
      {enquiry.open ? (
        <ViewingPanel enquiry={enquiry} directions={listing ? directionsUrl(listing.address, listing.geo) : null} />
      ) : null}
      {rentRecord && enquiry.open ? (
        <LazyRentRecordSharePanel
          leadId={enquiry.id}
          record={rentRecord.record}
          share={rentRecord.shares.find((s) => s.lead?.id === enquiry.id && s.state === "live") ?? null}
        />
      ) : null}
      <EnquiryThread enquiry={enquiry} />
      {enquiry.listing.available ? (
        <Button asChild variant="secondary" size="lg" block>
          <Link href={`/rent/${enquiry.listing.slug}`} data-testid="enquiry-listing">
            {t("detail.listing")}
          </Link>
        </Button>
      ) : null}
    </Screen>
  );
}
