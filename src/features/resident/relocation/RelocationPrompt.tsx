import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconSearch } from "@/ui/icons/glyphs/search";

/**
 * *Find your next place* after a move-out notice (D-299) — on the notice's done screen and on the lease page while
 * the notice is on file. Only a way in: nothing is shared before I turn relocation help on at `/relocation`.
 */
export function RelocationPrompt({ href = "/relocation" }: { href?: string }) {
  const t = useTranslations("resident.relocation.prompt");
  return (
    <Card as="section" padding="md" aria-labelledby="relocation-prompt-title" data-testid="relocation-prompt">
      <h2 id="relocation-prompt-title" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted mt-1 text-sm">{t("body")}</p>
      <div className="mt-3">
        <Button asChild variant="secondary" size="lg" block iconStart={IconSearch} iconEnd={IconForward}>
          <Link href={href} data-testid="relocation-prompt-open">
            {t("cta")}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
