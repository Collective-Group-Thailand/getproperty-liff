"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Checkbox } from "@/ui/components/Checkbox";
import { toast } from "@/ui/components/Toast";

/** "I have read these house rules" → `POST /v1/resident/building-rules/actions/acknowledge { unitId }`. */
export function AcknowledgeRules({ unitId }: { unitId: string }) {
  const t = useTranslations("resident.community.rules");
  const router = useRouter();
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="building-rules-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!read) return;
        setBusy(true);
        setError(null);
        try {
          unwrap(await browserApi.POST("/v1/resident/building-rules/actions/acknowledge", { body: { unitId } }));
          void toast.success(t("done"));
          router.refresh();
        } catch (caught) {
          if (!isApiError(caught)) throw caught;
          setError(caught);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Checkbox
        label={t("checkbox")}
        checked={read}
        onCheckedChange={(checked) => setRead(checked === true)}
        data-testid="building-rules-check"
      />
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="lg" block disabled={!read} loading={busy} data-testid="building-rules-submit">
        {t("submit")}
      </Button>
    </form>
  );
}
