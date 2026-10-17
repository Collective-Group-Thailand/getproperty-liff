"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { bffJson } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import type { InvitationAccepted, ResidentUnit } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Icon } from "@/ui/icons";

/**
 * Accepting an operator's invitation (D-061): the code comes from the invite QR/SMS deep link
 * (`liff.state=/link?code=…`) or is typed in. The resident confirms with one tap — a link never accepts by
 * itself — and sees which unit(s) they now occupy; expired and used codes say so and point to the office.
 * CONTRACT-REQUEST #1: `POST /v1/resident/link` is not in the contract yet.
 */
export function LinkInvitation({ initialCode }: { initialCode: string }) {
  const t = useTranslations("resident.link");
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<ApiError | null>(null);
  const [linked, setLinked] = useState<ResidentUnit[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // CONTRACT-REQUEST #1 (docs/contract-requests.md).
      const result = await bffJson<InvitationAccepted>("/v1/resident/link", {
        method: "POST",
        body: { code: code.trim() },
      });
      setLinked(result.units);
    } catch (caught) {
      if (!isApiError(caught)) throw caught;
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (linked) {
    return (
      <div className="flex flex-col gap-5 py-6" data-testid="link-success">
        <Callout tone="success" title={t("success.title")}>
          {t("success.body", { count: linked.length })}
        </Callout>
        <ul className="flex flex-col gap-2" role="list">
          {linked.map((unit) => (
            <li key={unit.unitId}>
              <Card padding="md" className="flex items-center gap-3">
                <Icon name="room" className="text-primary text-2xl" />
                <span className="font-semibold">{t("unit", { unit: unit.unitNo, building: unit.buildingName })}</span>
              </Card>
            </li>
          ))}
        </ul>
        <Button
          size="lg"
          block
          iconEnd="forward"
          onClick={() => {
            router.replace("/");
            router.refresh();
          }}
          data-testid="link-continue"
        >
          {t("success.continue")}
        </Button>
      </div>
    );
  }

  const knownProblem =
    error?.code === "invitation.not_found"
      ? "notFound"
      : error?.code === "invitation.not_pending"
        ? "notPending"
        : null;

  return (
    <form className="flex flex-col gap-5 py-6" onSubmit={submit} data-testid="link-form" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      <Field label={t("codeLabel")} error={error?.fieldError("code")}>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          inputSize="lg"
          className="font-mono tracking-wider"
          name="code"
        />
      </Field>
      {knownProblem ? (
        <Callout tone="warning" title={t(`${knownProblem}.title`)}>
          {t(`${knownProblem}.body`)}
        </Callout>
      ) : error && !error.fieldError("code") ? (
        <ProblemCallout error={error} />
      ) : null}
      <Button
        type="submit"
        size="lg"
        block
        loading={busy}
        disabled={code.trim().length < 4}
        iconStart="key"
        data-testid="link-submit"
      >
        {t("submit")}
      </Button>
    </form>
  );
}
