import { getTranslations } from "next-intl/server";

import { DSR_STATE } from "@/domain/status/dsr";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ResidentPrivacy } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";

import { ConsentManager } from "./ConsentManager";
import { DsrForm } from "./DsrForm";

/**
 * Privacy (D-025, PDPA): who holds my data (each tenant as controller, the categories per party — never the
 * values), my consents with withdraw/grant, my PDPA requests with their due dates, and the form for a new one.
 */
export async function PrivacyView({ privacy, locale }: { privacy: ResidentPrivacy; locale: Locale }) {
  const t = await getTranslations("resident.profile");
  const root = await getTranslations();
  const capturedOn = Object.fromEntries(
    privacy.consents.filter((c) => c.capturedAt).map((c) => [c.key, formatDate(c.capturedAt!, locale)]),
  );
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="privacy">
      <h1 className="font-display text-2xl font-semibold">{t("privacy.title")}</h1>
      <p className="text-muted">{t("privacy.lead")}</p>

      {!privacy.consentComplete ? <Callout tone="warning">{t("privacy.incomplete")}</Callout> : null}

      <section aria-labelledby="consents-title" className="flex flex-col gap-3">
        <h2 id="consents-title" className="font-semibold">
          {t("consents.title")}
        </h2>
        <ConsentManager purposes={privacy.consents} capturedOn={capturedOn} />
      </section>

      <Card as="section" padding="md" aria-labelledby="controllers-title">
        <h2 id="controllers-title" className="font-semibold">
          {t("controllers.title")}
        </h2>
        <p className="text-muted mt-1 text-sm">{t("controllers.lead")}</p>
        <ul className="mt-3 flex flex-col gap-3" role="list" data-testid="privacy-controllers">
          {privacy.controllers.map((controller) => (
            <li key={controller.legalName}>
              <p className="font-medium">{controller.legalName}</p>
              {controller.parties.map((party) => (
                <p key={party.partyId} className="text-muted text-sm">
                  {t("controllers.fields", {
                    fields: party.fieldsHeld.map((field) => t(`controllers.field.${field}`)).join(", "),
                  })}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" padding="md" aria-labelledby="dsr-title">
        <h2 id="dsr-title" className="font-semibold">
          {t("dsr.title")}
        </h2>
        <p className="text-muted mt-1 text-sm">{t("dsr.lead")}</p>
        {privacy.requests.length ? (
          <ul className="mt-3 flex flex-col gap-2" role="list" data-testid="dsr-list">
            {privacy.requests.map((request) => (
              <li
                key={request.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2"
              >
                <span>
                  <span className="block font-medium">{t(`dsr.kinds.${request.kind}.title`)}</span>
                  <span className="text-muted block text-xs">
                    {t("dsr.dates", {
                      received: formatDate(request.receivedAt, locale),
                      due: formatDate(request.dueAt, locale),
                    })}
                  </span>
                </span>
                <StatusBadge
                  size="sm"
                  status={DSR_STATE[request.state]}
                  label={root(DSR_STATE[request.state].labelKey)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4">
          <DsrForm />
        </div>
      </Card>
    </div>
  );
}
