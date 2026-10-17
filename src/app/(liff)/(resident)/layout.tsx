import { getTranslations } from "next-intl/server";

import { RealtimeBridge } from "@/features/resident/realtime/RealtimeBridge";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { currentPath, requireResident } from "@/lib/auth/guards";
import { Button } from "@/ui/components/Button";

/**
 * Every resident screen (home now; bills, usage, lease, profile… in L2–L4) sits behind this guard: a session,
 * then the required consents (D-025). An API failure other than "signed out" shows the error with its request id
 * instead of the page. The realtime bridge (payment status, notifications) runs only here.
 */
export default async function ResidentAreaLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireResident();
  if (actor.status === "error") {
    const [t, path] = await Promise.all([getTranslations("common"), currentPath()]);
    return (
      <ResidentShell active={null} chrome="minimal">
        <ProblemPage
          error={actor.error}
          action={
            <Button asChild variant="secondary" iconStart="refresh">
              <a href={path}>{t("retry")}</a>
            </Button>
          }
        />
      </ResidentShell>
    );
  }
  return (
    <>
      {children}
      <RealtimeBridge />
    </>
  );
}
