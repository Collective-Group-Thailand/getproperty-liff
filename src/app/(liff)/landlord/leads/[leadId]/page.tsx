import { getLocale, getTranslations } from "next-intl/server";

import { VIEWING_STATUS } from "@/domain/status/viewing";
import { loadLead } from "@/features/landlord/data";
import { LeadConversation } from "@/features/landlord/LeadConversation";
import { NotLandlord } from "@/features/landlord/NotLandlord";
import { ViewingDecision } from "@/features/landlord/ViewingDecision";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { formatDate, formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { requireLandlord } from "@/lib/auth/guards";
import { serverEnv } from "@/lib/env";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";

export async function generateMetadata() {
  const t = await getTranslations("landlord.home.leads");
  return { title: t("title") };
}

/** One enquiry in LINE (L5 5.3): what the prospect asked, the conversation, viewings to confirm, a reply. */
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
  const facts = [
    lead.data.moveInDate ? formatDate(lead.data.moveInDate, locale) : null,
    lead.data.termMonths ? t("term", { months: lead.data.termMonths }) : null,
    lead.data.occupants ? t("occupants", { count: lead.data.occupants }) : null,
  ].filter(Boolean);
  const requested = lead.data.viewings.filter((viewing) => viewing.state === "requested");
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="landlord-lead-page">
      <BackLink href="/landlord">{t("back")}</BackLink>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{lead.data.prospect.name}</h1>
        <p className="text-muted">{t("listing", { title: lead.data.listing.title })}</p>
        {facts.length ? <p className="text-sm">{facts.join(" · ")}</p> : null}
      </div>
      {lead.data.viewings.length ? (
        <Card as="section" padding="md" aria-labelledby="lead-viewings" className="flex flex-col gap-3">
          <h2 id="lead-viewings" className="font-semibold">
            {t("viewings")}
          </h2>
          <ul className="flex flex-col gap-3" role="list">
            {lead.data.viewings.map((viewing) => {
              const status = VIEWING_STATUS[viewing.state];
              return (
                <li
                  key={viewing.id}
                  className="flex flex-col gap-2"
                  data-testid="lead-viewing"
                  data-state={viewing.state}
                >
                  <div className="flex items-center justify-between gap-2">
                    <time dateTime={viewing.startsAt}>{formatDateTime(viewing.startsAt, locale)}</time>
                    <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
                  </div>
                  {requested.includes(viewing) ? <ViewingDecision viewingId={viewing.id} /> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
      <LeadConversation lead={lead.data} />
    </div>
  );
}
