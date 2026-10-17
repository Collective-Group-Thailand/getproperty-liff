import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/EmptyState";

export async function generateMetadata() {
  const t = await getTranslations("resident.auth.signedOut");
  return { title: t("title") };
}

/** After "sign out": the cookies are gone (the BFF cleared them and ended the API session). */
export default async function SignedOutPage() {
  const t = await getTranslations("resident.auth.signedOut");
  return (
    <ResidentShell active={null} chrome="minimal">
      <div className="py-10" data-testid="signed-out">
        <EmptyState
          icon="check-circle"
          title={t("title")}
          description={t("body")}
          action={
            <Button asChild>
              <Link href="/auth">{t("again")}</Link>
            </Button>
          }
        />
      </div>
    </ResidentShell>
  );
}
