import { getTranslations } from "next-intl/server";

import { Wordmark } from "@/ui/brand";
import { ErrorState } from "@/ui/components/ErrorState";

/**
 * The root not-found boundary (e.g. the technician screens while their flag is off). It is part of every page's
 * tree, so it renders without client components (D-179): no shell, the logo (server-rendered markup), a plain link
 * home. Unknown paths get the shell version (`(shell)/not-found.tsx`).
 */
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-8 px-4 py-16">
      <Wordmark size="md" />
      <ErrorState
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        action={
          // A full load home is right after a dead end, and `next/link` would add a client module to every page.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a className="text-primary font-semibold underline underline-offset-4" href="/">
            {t("goHome")}
          </a>
        }
      />
    </main>
  );
}
