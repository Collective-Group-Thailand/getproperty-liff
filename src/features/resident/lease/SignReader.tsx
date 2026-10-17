import { getTranslations } from "next-intl/server";

import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ResidentLease } from "@/lib/api/types";

/**
 * What the resident reads before signing (rendered on the server and handed to `SignFlow`, so the reading step
 * costs no client JavaScript): the terms the API returns and every clause the office added; the full lease (PDF)
 * stays the binding text, one tap away in the flow.
 */
export async function SignReader({ lease, locale }: { lease: ResidentLease; locale: Locale }) {
  const t = await getTranslations("resident.lease");
  const money = (value: string) => formatTHB(value, locale);
  const rows: [string, string, boolean][] = [
    [
      t("sign.read.unit"),
      t("sign.read.unitValue", { unit: lease.unitNo, building: lease.buildingName, operator: lease.tenantName }),
      false,
    ],
    [
      t("sign.read.term"),
      t("terms.termValue", {
        start: formatDate(lease.startDate, locale),
        end: formatDate(lease.endDate, locale),
        months: lease.months,
      }),
      false,
    ],
    [t("sign.read.rent"), t("terms.perMonth", { amount: money(lease.rent) }), true],
    [t("sign.read.deposit"), money(lease.depositAmount), true],
    [t("sign.read.advance"), money(lease.advanceRentAmount), true],
  ];
  return (
    <>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map(([label, value, numeric]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className={numeric ? "font-medium tabular-nums" : "font-medium"}>{value}</dd>
          </div>
        ))}
        {lease.lines.length ? (
          <div>
            <dt className="text-muted">{t("sign.read.charges")}</dt>
            {lease.lines.map((line) => (
              <dd key={line.id} className="font-medium">
                {line.description} ·{" "}
                {line.recurrence === "monthly"
                  ? t("terms.perMonth", { amount: money(line.amount) })
                  : t("terms.once", { amount: money(line.amount) })}
              </dd>
            ))}
          </div>
        ) : null}
      </dl>
      {lease.addendum.length ? (
        <>
          <h2 className="mt-4 text-sm font-semibold">{t("sign.read.clauses")}</h2>
          <ul className="mt-1 flex flex-col gap-2 text-sm" role="list">
            {lease.addendum.map((clause, index) => (
              <li key={`${clause.type}-${index}`}>
                <span className="font-medium">{clause.title}</span>
                <span className="text-muted block">{clause.text}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
