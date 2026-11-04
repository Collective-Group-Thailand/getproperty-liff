import { getLocale, getTranslations } from "next-intl/server";

import { VIEWING_STATUS } from "@/domain/status/viewing";
import { loadLead } from "@/features/landlord/data";
import { LeadConversation } from "@/features/landlord/LeadConversation";
import { NotLandlord } from "@/features/landlord/NotLandlord";
import { ViewingDecision } from "@/features/landlord/ViewingDecision";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { FACT_ROWS_CLASS, Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { formatCountry, formatDate, formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { requireLandlord } from "@/lib/auth/guards";
import { serverEnv } from "@/lib/env";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { DescriptionList, type DescriptionItem } from "@/ui/components/DescriptionList";
import { IconArchive } from "@/ui/icons/glyphs/archive";
import { IconChat } from "@/ui/icons/glyphs/chat";
import { IconClock } from "@/ui/icons/glyphs/clock";

export async function generateMetadata() {
  const t = await getTranslations("landlord.home.leads");
  return { title: t("title") };
}

/**
 * One enquiry in LINE (L5 5.3) in the record frame (redesign G2): the prospect as the title with where the enquiry
 * stands, the facts they gave, viewings to confirm, then the conversation with the reply box at the end.
 */
export default async function LandlordLeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const actor = await requireLandlord({ path: `/landlord/leads/${leadId}` });
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  if (actor.status === "not-landlord") return <NotLandlord consoleUrl={serverEnv().OWNER_CONSOLE_URL} />;
  const [lead, t, root, current] = await Promise.all([
    loadLead(leadId),
    getTranslations("landlord.home.lead"),
    getTranslations(),
    getLocale(),
  ]);
  if (lead.error) return <ProblemPage error={lead.error} />;
  const locale = isLocale(current) ? current : "th";
  const data = lead.data;
  // Where it stands, as the API says it (never decided here): closed once won or lost, else whose turn it is.
  const closed = data.state === "won" || data.state === "lost";
  const status = closed ? (
    <Badge tone="neutral" icon={IconArchive}>
      {t("status.closed")}
    </Badge>
  ) : data.awaitingReply ? (
    <Badge tone="warning" icon={IconClock}>
      {t("status.awaiting")}
    </Badge>
  ) : (
    <Badge tone="info" icon={IconChat}>
      {t("status.talking")}
    </Badge>
  );
  const facts: DescriptionItem[] = [
    { id: "received", term: t("fact.received"), description: formatDateTime(data.createdAt, locale) },
    ...(data.moveInDate
      ? [{ id: "moveIn", term: t("fact.moveIn"), description: formatDate(data.moveInDate, locale) }]
      : []),
    ...(data.termMonths
      ? [{ id: "term", term: t("fact.term"), description: t("term", { months: data.termMonths }) }]
      : []),
    ...(data.occupants
      ? [{ id: "occupants", term: t("fact.occupants"), description: t("occupants", { count: data.occupants }) }]
      : []),
    ...(data.nationality
      ? [{ id: "nationality", term: t("fact.nationality"), description: formatCountry(data.nationality, locale) }]
      : []),
    ...(data.notes
      ? [{ id: "notes", term: t("fact.notes"), description: <span className="whitespace-pre-line">{data.notes}</span> }]
      : []),
  ];
  const requested = data.viewings.filter((viewing) => viewing.state === "requested");
  return (
    <Screen testId="landlord-lead-page" data-state={data.state}>
      <ScreenHeader
        back={{ href: "/landlord", label: t("back") }}
        title={data.prospect.name}
        lede={t("listing", { title: data.listing.title })}
        status={<span data-testid="lead-status">{status}</span>}
      />
      <Card as="section" padding="md" aria-label={t("fact.title")} data-testid="lead-facts">
        <DescriptionList layout="rows" items={facts} className={FACT_ROWS_CLASS} />
      </Card>
      {data.viewings.length ? (
        <Section title={t("viewings")} titleId="lead-viewings">
          <Card padding="none">
            <ul className="divide-border flex flex-col divide-y" role="list">
              {data.viewings.map((viewing) => {
                const meta = VIEWING_STATUS[viewing.state];
                return (
                  <li
                    key={viewing.id}
                    className="flex flex-col gap-3 px-4 py-3"
                    data-testid="lead-viewing"
                    data-state={viewing.state}
                  >
                    <div className="flex min-h-8 items-center justify-between gap-3">
                      <time dateTime={viewing.startsAt} className="font-medium tabular-nums">
                        {formatDateTime(viewing.startsAt, locale)}
                      </time>
                      <StatusBadge status={meta} label={root(meta.labelKey)} size="sm" />
                    </div>
                    {requested.includes(viewing) ? <ViewingDecision viewingId={viewing.id} /> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      ) : null}
      <LeadConversation lead={data} />
    </Screen>
  );
}
