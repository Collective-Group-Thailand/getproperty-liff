import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/ui/components/Button";

/**
 * The next step of an empty or status card (redesign G2: no dead ends) — an outlined link, "Back to home" unless the
 * screen names a better place. Works in server and client components (no async, `useTranslations`).
 */
export function EmptyAction({ href = "/", label }: { href?: string; label?: string }) {
  const t = useTranslations("common");
  return (
    <Button asChild variant="secondary">
      <Link href={href}>{label ?? t("goHome")}</Link>
    </Button>
  );
}
