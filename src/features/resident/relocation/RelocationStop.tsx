"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";

import { RELOCATION_PURPOSE } from "./model";

/**
 * Stop in one tap (D-025: withdrawing is as easy as consenting) — `granted: false` for the version I agreed to. The
 * API closes my open offers and erases their destinations at once (D-299); nothing else changes.
 */
export function RelocationStop({ version, language }: { version: number; language: "th" | "en" }) {
  const t = useTranslations("resident.relocation.status");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function stop() {
    setBusy(true);
    setError(null);
    let leaving = false;
    try {
      unwrap(
        await browserApi.POST("/v1/resident/consents", {
          body: { language, items: [{ purposeKey: RELOCATION_PURPOSE, version, granted: false }] },
        }),
      );
      leaving = true;
      router.replace("/relocation?stopped=1", { scroll: true });
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <ProblemCallout error={error} /> : null}
      <Button
        variant="secondary"
        size="lg"
        block
        loading={busy}
        onClick={() => void stop()}
        data-testid="relocation-stop"
      >
        {t("stop")}
      </Button>
    </div>
  );
}
