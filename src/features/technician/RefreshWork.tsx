"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { bffJson } from "@/lib/api/browser";
import { Button } from "@/ui/components/Button";
import { IconRefresh } from "@/ui/icons/glyphs/refresh";

/**
 * "Check for new work": the technician token carries `work_order:` scopes computed at refresh (D-210), so a new
 * assignment needs a rotated session — `POST /bff/auth/technician/refresh`, then the list is read again.
 */
export function RefreshWork() {
  const t = useTranslations("technician.workOrders");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="lg"
      block
      iconStart={IconRefresh}
      loading={busy}
      data-testid="technician-refresh"
      onClick={async () => {
        setBusy(true);
        try {
          await bffJson("/auth/technician/refresh", { method: "POST" });
        } catch {
          // A refused refresh clears the session; the reload then sends the technician to sign in.
        } finally {
          router.refresh();
          setBusy(false);
        }
      }}
    >
      {t("refresh")}
    </Button>
  );
}
