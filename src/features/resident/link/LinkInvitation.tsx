"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { bffJson, browserApi, unwrap } from "@/lib/api/browser";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { ResidentLinked } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { Icon } from "@/ui/icons";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconKey } from "@/ui/icons/glyphs/key";
import { IconRoom } from "@/ui/icons/glyphs/room";

/**
 * Accepting an operator's invitation (D-061): the code comes from the invite QR/SMS deep link
 * (`liff.state=/link?code=…`) or is typed in. The resident confirms with one tap — a link never accepts by
 * itself — and sees which unit(s) they now occupy; expired and used codes say so and point to the office
 * (`POST /v1/resident/link`).
 */
export function LinkInvitation({ initialCode }: { initialCode: string }) {
  const t = useTranslations("resident.link");
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<ApiError | null>(null);
  const [linked, setLinked] = useState<ResidentLinked | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useIdempotentAttempt<{ code: string }>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    let result: ResidentLinked;
    try {
      // One key per code: a retry after a lost answer replays the link instead of "code already used" (review M2).
      const { key, body } = await attempt.prepare({ code: code.trim() }, () => ({ code: code.trim() }));
      result = unwrap(
        await browserApi.POST("/v1/resident/link", { params: { header: { "Idempotency-Key": key } }, body }),
      );
      attempt.succeeded();
    } catch (caught) {
      const problem = toApiError(caught);
      attempt.failed(problem);
      if (problem.code === "consent.required") {
        router.replace(`/consent?next=${encodeURIComponent(`/link?code=${encodeURIComponent(code.trim())}`)}`);
        return;
      }
      setError(problem);
      return;
    } finally {
      setBusy(false);
    }
    // The link is on file: show it whatever the session rotation does (review L3). The new `lease:` / `unit:` scopes
    // are best-effort here; when this refresh fails, the resident layout's rescope guard renews the session on the
    // next page (`/auth/rescope`), so a retry of the — now used — code is never needed.
    setLinked(result);
    if (result.refreshRequired) await bffJson("/auth/refresh", { method: "POST" }).catch(() => undefined);
  }

  if (linked) {
    const next = linked.units.length ? "/" : `/lease/${linked.leaseId}`;
    return (
      <div className="flex flex-col gap-5 py-6" data-testid="link-success">
        <Callout tone="success" title={t("success.title")}>
          {linked.units.length ? t("success.body", { count: linked.units.length }) : t("success.lease")}
        </Callout>
        <ul className="flex flex-col gap-2" role="list">
          {linked.units.map((unit) => (
            <li key={unit.unitId}>
              <Card padding="md" className="flex items-center gap-3">
                <Icon icon={IconRoom} className="text-primary text-2xl" />
                <span className="font-semibold">{t("unit", { unit: unit.unitNo, building: unit.buildingName })}</span>
              </Card>
            </li>
          ))}
        </ul>
        <Button
          size="lg"
          block
          iconEnd={IconForward}
          onClick={() => {
            router.replace(next);
            router.refresh();
          }}
          data-testid="link-continue"
        >
          {linked.units.length ? t("success.continue") : t("success.openLease")}
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
        iconStart={IconKey}
        data-testid="link-submit"
      >
        {t("submit")}
      </Button>
    </form>
  );
}
