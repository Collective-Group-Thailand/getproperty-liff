import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { Button } from "@/ui/components/Button";
import { ErrorState } from "@/ui/components/ErrorState";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <ResidentShell active={null}>
      <div className="py-10">
        <ErrorState
          title={t("notFoundTitle")}
          description={t("notFoundBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/">{t("goHome")}</Link>
            </Button>
          }
        />
      </div>
    </ResidentShell>
  );
}
