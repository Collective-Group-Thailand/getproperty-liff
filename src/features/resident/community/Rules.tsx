import { getTranslations } from "next-intl/server";

import { formatDate, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconChecklist } from "@/ui/icons/glyphs/checklist";

import type { BuildingRules } from "./data";
import { AcknowledgeRules } from "./AcknowledgeRules";

/**
 * The building's house rules in force (D-073, D-212): the version, its text in my language when translated, and the
 * acknowledgement — recorded with my lease (`POST /v1/resident/building-rules/actions/acknowledge`).
 */
export async function RulesView({ rules, unitId, locale }: { rules: BuildingRules; unitId: string; locale: Locale }) {
  const t = await getTranslations("resident.community.rules");
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="rules">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {rules.ruleId && rules.body ? (
        <Card as="article" padding="md" className="flex flex-col gap-3" lang={rules.language}>
          {rules.title ? <h2 className="text-lg font-semibold">{rules.title}</h2> : null}
          {rules.version && rules.effectiveFrom ? (
            <p className="text-muted text-sm">
              {t("version", { version: rules.version, date: formatDate(rules.effectiveFrom, locale) })}
            </p>
          ) : null}
          <p className="whitespace-pre-line" data-testid="rules-body">
            {rules.body}
          </p>
          {rules.acknowledgedAt ? (
            <p className="text-success-subtle-fg text-sm font-medium" data-testid="rules-acknowledged">
              {t("acknowledged", { date: formatDateTime(rules.acknowledgedAt, locale) })}
            </p>
          ) : (
            <AcknowledgeRules unitId={unitId} />
          )}
        </Card>
      ) : (
        <EmptyState icon={IconChecklist} title={t("none")} />
      )}
    </div>
  );
}
