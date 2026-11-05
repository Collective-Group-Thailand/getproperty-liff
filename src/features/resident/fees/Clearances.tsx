import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { CLEARANCE_STATUS } from "@/domain/status/juristic";
import { List, Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { DebtClearance } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { IconShield } from "@/ui/icons/glyphs/shield";

/**
 * Debt-clearance certificates of one unit (D-306): what it is for and the request (the screen's one filled action),
 * then my requests and certificates, newest first, each with its state.
 */
export async function ClearanceList({
  unitId,
  unitName,
  clearances,
  locale,
}: {
  unitId: string;
  unitName: string;
  clearances: DebtClearance[];
  locale: Locale;
}) {
  const t = await getTranslations("resident.fees.clearance");
  const status = await getTranslations();
  return (
    <Screen testId="clearance-list">
      <ScreenHeader title={t("title")} lede={unitName} flush />
      <Card as="section" aria-labelledby="clearance-ask-title" padding="lg">
        <h2 id="clearance-ask-title" className="font-semibold">
          {t("askTitle")}
        </h2>
        <p className="text-muted mt-1 text-sm">{t("askBody")}</p>
        <Button asChild size="xl" block className="mt-4">
          <Link href={`/units/${unitId}/debt-clearances/new`} data-testid="clearance-request">
            {t("ask")}
          </Link>
        </Button>
      </Card>
      {clearances.length ? (
        <Section title={t("mine")} titleId="clearance-mine-title">
          <List
            testId="clearance-rows"
            rows={clearances.map((clearance) => ({
              key: clearance.id,
              href: `/units/${unitId}/debt-clearances/${clearance.id}`,
              icon: IconShield,
              title: clearance.number ? (
                <span className="font-mono">{clearance.number}</span>
              ) : (
                t("requestOf", { date: formatDate(clearance.createdAt, locale) })
              ),
              meta: t("asOfLine", { date: formatDate(clearance.asOf, locale) }),
              endMeta: (
                <StatusBadge
                  size="sm"
                  status={CLEARANCE_STATUS[clearance.state]}
                  label={status(CLEARANCE_STATUS[clearance.state].labelKey)}
                />
              ),
              testId: "clearance-row",
            }))}
          />
        </Section>
      ) : null}
    </Screen>
  );
}
