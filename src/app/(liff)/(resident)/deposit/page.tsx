import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DEPOSIT_STATUS } from "@/domain/status/deposit";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { formatTHB } from "@/i18n/format";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconShield } from "@/ui/icons/glyphs/shield";

export async function generateMetadata() {
  const t = await getTranslations("resident.deposit");
  return { title: t("listTitle") };
}

/** Deposits of my leases (D-023); with one deposit the resident goes straight to it. */
export default async function DepositsPage() {
  const [t, root, locale, api] = await Promise.all([
    getTranslations("resident.deposit"),
    getTranslations(),
    pageLocale(),
    serverApi(),
  ]);
  const { data, error, response } = await api.GET("/v1/resident/deposits");
  if (data?.length === 1) redirect(`/deposit/${data[0]!.id}`);
  return (
    <ResidentShell active={null}>
      {!data ? (
        <ProblemPage error={problemFromParsed(response, error)} />
      ) : data.length === 0 ? (
        <EmptyState icon={IconShield} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <div className="flex flex-col gap-4 py-5" data-testid="deposit-list">
          <h1 className="font-display text-2xl font-semibold">{t("listTitle")}</h1>
          <ul className="flex flex-col gap-3" role="list">
            {data.map((deposit) => (
              <li key={deposit.id}>
                <Link href={`/deposit/${deposit.id}`} className="block">
                  <Card interactive padding="md" className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block font-semibold">{t("title", { unit: deposit.unitNo })}</span>
                      <span className="text-muted block text-sm tabular-nums">
                        {formatTHB(deposit.amountSecurity, locale)}
                      </span>
                    </span>
                    <StatusBadge
                      size="sm"
                      status={DEPOSIT_STATUS[deposit.status]}
                      label={root(DEPOSIT_STATUS[deposit.status].labelKey)}
                    />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ResidentShell>
  );
}
