import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LEASE_STATUS } from "@/domain/status/lease";
import { loadLeases, pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { formatDate } from "@/i18n/format";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconLease } from "@/ui/icons/glyphs/lease";

export async function generateMetadata() {
  const t = await getTranslations("resident.lease");
  return { title: t("list.title") };
}

/** My leases in every tenant (D-061); with one lease the resident goes straight to it. */
export default async function LeasesPage() {
  const [t, root, locale, leases] = await Promise.all([
    getTranslations("resident.lease"),
    getTranslations(),
    pageLocale(),
    loadLeases(),
  ]);
  if (leases.data?.length === 1) redirect(`/lease/${leases.data[0]!.id}`);
  return (
    <ResidentShell active={null}>
      {leases.error ? (
        <ProblemPage error={leases.error} />
      ) : leases.data.length === 0 ? (
        <EmptyState icon={IconLease} title={t("list.emptyTitle")} description={t("list.emptyBody")} />
      ) : (
        <div className="flex flex-col gap-4 py-5" data-testid="lease-list">
          <h1 className="font-display text-2xl font-semibold">{t("list.title")}</h1>
          <ul className="flex flex-col gap-3" role="list">
            {leases.data.map((lease) => (
              <li key={lease.id}>
                <Link href={`/lease/${lease.id}`} className="block">
                  <Card interactive padding="md">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{t("view.title", { unit: lease.unitNo })}</span>
                      <StatusBadge
                        size="sm"
                        status={LEASE_STATUS[lease.status]}
                        label={root(LEASE_STATUS[lease.status].labelKey)}
                      />
                    </div>
                    <p className="text-muted mt-1 text-sm">
                      {t("view.subtitle", { building: lease.buildingName, operator: lease.tenantName })}
                    </p>
                    <p className="text-muted text-sm">
                      {formatDate(lease.startDate, locale)} – {formatDate(lease.endDate, locale)}
                    </p>
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
