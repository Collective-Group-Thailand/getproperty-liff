import { getTranslations } from "next-intl/server";

import { ACCESS_RESULT } from "@/domain/status/credential";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { SimpleTable } from "@/ui/components/SimpleTable";

import type { AccessEvent } from "./data";

/** My unit's unlock log for the last 30 days (D-070: residents see their own room's log; PDPA, D-025). */
export async function UnlockLog({ events, unitNo, locale }: { events: AccessEvent[]; unitNo: string; locale: Locale }) {
  const [t, root] = await Promise.all([getTranslations("resident.access.log"), getTranslations()]);
  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="log-title"
      className="flex flex-col gap-3"
      data-testid="unlock-log"
    >
      <div>
        <h2 id="log-title" className="font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted mt-1 text-sm">{t("lead")}</p>
      </div>
      {events.length === 0 ? (
        <p className="text-muted text-sm">{t("empty")}</p>
      ) : (
        <SimpleTable
          caption={t("caption", { unit: unitNo })}
          minWidth="18rem"
          testId="unlock-table"
          columns={[
            { key: "time", header: t("time") },
            { key: "how", header: t("how") },
            { key: "result", header: t("result") },
          ]}
          rows={events.map((e) => {
            const result = ACCESS_RESULT[e.result];
            return {
              key: e.id,
              data: { result: e.result },
              cells: {
                time: <span className="tabular-nums">{formatDateTime(e.time, locale)}</span>,
                how: t(`source.${e.source}`),
                result: <StatusBadge status={result} label={root(result.labelKey)} size="sm" />,
              },
            };
          })}
        />
      )}
    </Card>
  );
}
