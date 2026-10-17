import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Button } from "@/ui/components/Button";
import { ErrorState } from "@/ui/components/ErrorState";

/** An unknown path, inside the resident shell (the group's layout). */
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
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
  );
}
