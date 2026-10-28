"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";

const MAX = 1000;

/** Writing to the owner in an open enquiry (L5 5.1). */
export function EnquiryWrite({ leadId }: { leadId: string }) {
  const t = useTranslations("prospect.rent.detail");
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/prospect/enquiries/{leadId}/messages", {
          params: { path: { leadId } },
          body: { body },
        }),
      );
      setDraft("");
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={send} data-testid="enquiry-write">
      <Field label={t("write")}>
        <Textarea rows={3} maxLength={MAX} value={draft} onChange={(event) => setDraft(event.target.value)} />
      </Field>
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="lg" block loading={busy} disabled={!draft.trim()} data-testid="enquiry-send">
        {t("send")}
      </Button>
    </form>
  );
}
