"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import { isApiError, type ApiError } from "@/lib/api/problem";
import type { DsrKind } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";

const KINDS: DsrKind[] = ["access", "rectification", "erasure", "portability", "objection", "restriction"];

/**
 * Filing a PDPA request (D-025, PDPA ss.30–36): the kind, optional details, sent to every controller I am a
 * resident of (`POST /v1/resident/data-subject-requests`, one `Idempotency-Key` per filing). The answer is due
 * within the period the API reports (`dueAt`); this app never promises a date of its own.
 */
export function DsrForm() {
  const t = useTranslations("resident.profile.dsr");
  const router = useRouter();
  const [kind, setKind] = useState<DsrKind | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sent, setSent] = useState(false);
  const [missing, setMissing] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);

  if (sent) {
    return (
      <div className="flex flex-col gap-3" data-testid="dsr-sent">
        <Callout tone="success" title={t("sentTitle")}>
          {t("sentBody")}
        </Callout>
        <Button
          variant="secondary"
          size="lg"
          block
          onClick={() => {
            setSent(false);
            setKind(null);
            setDetails("");
            setKey(newIdempotencyKey());
          }}
        >
          {t("another")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="dsr-form"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (!kind) {
          setMissing(true);
          return;
        }
        setMissing(false);
        setBusy(true);
        setError(null);
        try {
          unwrap(
            await browserApi.POST("/v1/resident/data-subject-requests", {
              params: { header: { "Idempotency-Key": key } },
              body: { kind, details: details.trim() || null },
            }),
          );
          setSent(true);
          router.refresh();
        } catch (caught) {
          if (!isApiError(caught)) throw caught;
          setError(caught);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="flex flex-col gap-2" aria-describedby={missing ? "dsr-kind-missing" : undefined}>
        <legend className="mb-1 font-medium">{t("kind")}</legend>
        {KINDS.map((value) => (
          <label
            key={value}
            className="rounded-control border-border has-[:checked]:border-primary has-[:checked]:bg-primary-subtle flex min-h-12 cursor-pointer items-start gap-3 border p-3"
          >
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => {
                setKind(value);
                setKey(newIdempotencyKey());
              }}
              className="accent-primary mt-1 size-5"
            />
            <span>
              <span className="block font-medium">{t(`kinds.${value}.title`)}</span>
              <span className="text-muted block text-sm">{t(`kinds.${value}.body`)}</span>
            </span>
          </label>
        ))}
        {missing ? (
          <div id="dsr-kind-missing">
            <Callout tone="warning">{t("kindMissing")}</Callout>
          </div>
        ) : null}
      </fieldset>
      <Field label={t("details")} hint={t("detailsHint")}>
        <Textarea
          name="details"
          rows={3}
          maxLength={2000}
          value={details}
          onChange={(event) => {
            setDetails(event.target.value);
            setKey(newIdempotencyKey());
          }}
        />
      </Field>
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="lg" block loading={busy} data-testid="dsr-submit">
        {t("submit")}
      </Button>
    </form>
  );
}
