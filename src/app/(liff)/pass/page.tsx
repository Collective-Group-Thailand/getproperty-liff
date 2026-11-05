import { getTranslations } from "next-intl/server";

import { PassView } from "@/features/resident/visitors/PassView";
import { Wordmark } from "@/ui/brand";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.pass");
  return { title: t("title") };
}

/**
 * `/pass#t=gpv1…` — the visitor's pass (JL4, D-327 (5)): public (the visitor has no account), drawn in the browser
 * from the link's fragment — the token never reaches this server, its logs or a referrer. Shown at the gate's scanner.
 */
export default function PassPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[390px] flex-col items-center gap-6 px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-10">
      <Wordmark size="sm" />
      <PassView />
    </main>
  );
}
