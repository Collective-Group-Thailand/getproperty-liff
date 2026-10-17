import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { loadLease, pageLocale } from "@/features/resident/lease/data";
import { SignFlow } from "@/features/resident/lease/SignFlow";
import { SignReader } from "@/features/resident/lease/SignReader";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("resident.lease.sign");
  return { title: t("pageTitle") };
}

/**
 * The e-signature of a lease the office sent (D-062). Only when the API offers `sign` in `nextActions`; otherwise
 * the resident is told why and sent back to the lease.
 */
export default async function SignPage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const [t, locale, lease] = await Promise.all([getTranslations("resident.lease"), pageLocale(), loadLease(leaseId)]);
  if (lease.error) {
    return (
      <ResidentShell active={null}>
        <ProblemPage error={lease.error} />
      </ResidentShell>
    );
  }
  const l = lease.data;
  if (!l.nextActions.includes("sign")) {
    return (
      <ResidentShell active={null}>
        <div className="flex flex-col gap-4 py-6" data-testid="sign-unavailable">
          <Callout tone="info" title={t("sign.unavailableTitle")}>
            {l.signatureRequired ? t("sign.unavailableBody") : t("sign.alreadySigned")}
          </Callout>
          <Button asChild size="lg" block>
            <Link href={`/lease/${l.id}`}>{t("sign.done.back")}</Link>
          </Button>
        </div>
      </ResidentShell>
    );
  }
  return (
    <ResidentShell active={null}>
      <BackLink href={`/lease/${l.id}`}>{t("back.lease")}</BackLink>
      <SignFlow lease={l} reader={<SignReader lease={l} locale={locale} />} />
    </ResidentShell>
  );
}
