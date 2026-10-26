import { getLocale, getTranslations } from "next-intl/server";

import { formatDecimal, formatTHB } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";
import { Card } from "@/ui/components/Card";

type Utility = Schemas["ListingUtilityDto"];
type Rate = Schemas["ListingUtilityRateDto"];

/** `฿3.0000` → `฿3.00`; four decimals only when the owner priced them. */
const price = (value: string, locale: Parameters<typeof formatTHB>[1]) =>
  formatTHB(value, locale, { decimals: /\.\d{2}[1-9]|\.\d{3}[1-9]/.test(value) ? 4 : 2 });

/**
 * What living here costs beyond the rent (D-265): the unit's power and water rates, its other monthly charges and —
 * when the owner shows it — the average of its last real bills. All from the API; nothing estimated on the phone.
 */
export async function ListingUtilityCard({ utility }: { utility: Utility }) {
  const [t, current] = await Promise.all([getTranslations("prospect.rent.utility"), getLocale()]);
  const locale = isLocale(current) ? current : "th";
  const rate = (value: Rate | null, unit: "kwh" | "m3") => {
    if (!value) return [t("notSet")];
    const per = t(`per.${unit}`);
    const lines =
      value.kind === "flat" && value.pricePerUnit
        ? [`${price(value.pricePerUnit, locale)} ${per}`]
        : value.tiers.map(
            (tier) =>
              `${
                tier.toUnits
                  ? t("tier", {
                      from: formatDecimal(tier.fromUnits, locale, 0),
                      to: formatDecimal(tier.toUnits, locale, 0),
                    })
                  : t("tierFrom", { from: formatDecimal(tier.fromUnits, locale, 0) })
              } ${price(tier.pricePerUnit, locale)} ${per}`,
          );
    return value.minimumCharge ? [...lines, t("minimum", { amount: formatTHB(value.minimumCharge, locale) })] : lines;
  };
  const rows: [string, string[]][] = [
    [t("electricity"), rate(utility.electricity, "kwh")],
    [t("water"), rate(utility.water, "m3")],
    ...utility.fixedCharges.map(
      (c) =>
        [c.name || t(`fixed.${c.kind}`), [`${formatTHB(c.amount, locale)} ${t("perMonth")}`]] as [string, string[]],
    ),
  ];
  return (
    <Card as="section" padding="md" className="flex flex-col gap-3" data-testid="prospect-utility">
      <h2 className="font-semibold">{t("title")}</h2>
      {utility.averageBill3m ? (
        <p className="m-0 flex flex-col">
          <span className="text-muted text-sm">{t("average", { count: utility.basedOnBills })}</span>
          <span className="text-lg font-semibold tabular-nums" data-testid="prospect-utility-average">
            {formatTHB(utility.averageBill3m, locale)}
            <span className="text-muted text-sm font-normal"> {t("perMonth")}</span>
          </span>
        </p>
      ) : null}
      <dl className="m-0 flex flex-col gap-2 text-sm">
        {rows.map(([label, lines]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 text-end tabular-nums">
              {lines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
