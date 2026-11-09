"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MANDATE_STATUS } from "@/domain/status/juristic";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { PaymentMandate, Schemas } from "@/lib/api/types";
import { openExternal } from "@/lib/liff/client";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { LazyAlertDialog } from "@/ui/components/overlays";
import { Icon } from "@/ui/icons";
import { IconBank } from "@/ui/icons/glyphs/bank";
import { IconExternal } from "@/ui/icons/glyphs/external";
import { IconRepeat } from "@/ui/icons/glyphs/repeat";
import { IconWallet } from "@/ui/icons/glyphs/wallet";
import { cn } from "@/ui/lib/cn";

import { liveMandate } from "./model";

type Method = Schemas["PaymentMandateMethod"];

/**
 * Auto-pay for the advance (quarterly, half-yearly, yearly) common-fee bills (D-308, D-325, channel `recurring`):
 * choose direct debit or a card → `POST …/payment-mandates` → the provider's page opens (`setupUrl`, the LIFF way) and
 * the mandate turns active on its callback. One mandate per unit; cancel stops further charges. Where the unit's
 * `recurringAvailable` is false (no provider, O-020; CR #44) or the API answers `recurring.unavailable`, the screen
 * says so plainly.
 */
export function AutoPay({
  unitId,
  mandates,
  locale,
  initialUnavailable = false,
}: {
  unitId: string;
  mandates: PaymentMandate[];
  locale: Locale;
  initialUnavailable?: boolean;
}) {
  const t = useTranslations("resident.fees.autopay");
  const status = useTranslations();
  const router = useRouter();
  const attempt = useIdempotentAttempt<Schemas["PaymentMandateCreateDto"]>();
  const live = liveMandate(mandates);
  const [method, setMethod] = useState<Method>("direct_debit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [unavailable, setUnavailable] = useState(initialUnavailable);
  const [opened, setOpened] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const frozen = await attempt.prepare({ method }, () => ({ method, scope: "advance_invoices" }));
    try {
      const created = unwrap(
        await browserApi.POST("/v1/resident/units/{unitId}/payment-mandates", {
          params: { path: { unitId }, header: { "Idempotency-Key": frozen.key } },
          body: frozen.body,
        }),
      );
      attempt.succeeded();
      const url = new URL(created.setupUrl, window.location.href).toString();
      setOpened(url);
      await openExternal(url);
      router.refresh();
    } catch (caught) {
      attempt.failed(caught);
      const problem = toApiError(caught);
      if (problem.code === "recurring.unavailable") {
        setUnavailable(true);
      } else if (problem.code === "payment_mandate.open_exists") {
        router.refresh();
      } else setError(problem);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(mandate: PaymentMandate) {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/units/{unitId}/payment-mandates/{mandateId}/actions/cancel", {
          params: { path: { unitId, mandateId: mandate.id } },
        }),
      );
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      setConfirm(false);
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (unavailable && !live) {
    return (
      <div data-testid="autopay-unavailable">
        <Callout tone="info" title={t("unavailable.title")}>
          {t("unavailable.body")}
        </Callout>
      </div>
    );
  }

  if (live) {
    return (
      <div className="flex flex-col gap-4" data-testid="autopay-live" data-state={live.state}>
        <Card as="section" aria-labelledby="autopay-live-title" padding="lg">
          <div className="flex items-start justify-between gap-3">
            <h2 id="autopay-live-title" className="flex items-center gap-2 font-semibold">
              <Icon icon={live.method === "card_token" ? IconWallet : IconBank} className="text-muted" />
              {t(`method.${live.method}`)}
            </h2>
            <StatusBadge status={MANDATE_STATUS[live.state]} label={status(MANDATE_STATUS[live.state].labelKey)} />
          </div>
          {live.masked ? <p className="mt-2 font-mono text-sm">{live.masked}</p> : null}
          <p className="text-muted mt-2 text-sm">
            {live.state === "active"
              ? t("activeBody", { date: formatDate(live.activatedAt ?? live.createdAt, locale) })
              : t("pendingBody")}
          </p>
          {live.state === "pending" && opened ? (
            <Button
              variant="ghost"
              size="lg"
              block
              className="mt-3"
              iconStart={IconExternal}
              onClick={() => void openExternal(opened)}
            >
              {t("openAgain")}
            </Button>
          ) : null}
        </Card>
        {error ? <ProblemCallout error={error} /> : null}
        <Button variant="destructive" size="lg" block onClick={() => setConfirm(true)} data-testid="autopay-cancel">
          {t("cancel.cta")}
        </Button>
        <LazyAlertDialog
          open={confirm}
          onOpenChange={(open) => (open ? null : setConfirm(false))}
          title={t("cancel.title")}
          description={t("cancel.body")}
          confirmLabel={t("cancel.confirm")}
          cancelLabel={t("cancel.keep")}
          tone="destructive"
          loading={busy}
          onConfirm={() => void cancel(live)}
        />
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="autopay-form"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("choose")}</legend>
        {(["direct_debit", "card_token"] as const).map((value) => (
          <label
            key={value}
            className={cn(
              "rounded-card border-border bg-surface flex min-h-16 cursor-pointer items-center gap-3 border px-4 py-3",
              method === value && "border-primary bg-primary-subtle",
            )}
          >
            <input
              type="radio"
              name="method"
              value={value}
              checked={method === value}
              onChange={() => setMethod(value)}
              className="accent-primary size-5"
              data-testid={`autopay-method-${value}`}
            />
            <Icon icon={value === "card_token" ? IconWallet : IconBank} className="text-muted text-xl" />
            <span className="flex flex-col">
              <span className="font-medium">{t(`method.${value}`)}</span>
              <span className="text-muted text-sm">{t(`methodBody.${value}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-muted text-sm">{t("how")}</p>
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="xl" block loading={busy} iconStart={IconRepeat} data-testid="autopay-start">
        {t("start")}
      </Button>
    </form>
  );
}
