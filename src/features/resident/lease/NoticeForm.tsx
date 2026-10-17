"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import type { ResidentLease } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Input, Textarea } from "@/ui/components/Input";
import { IconBack } from "@/ui/icons/glyphs/back";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";

/**
 * The 30-day move-out notice (D-020, ข้อ 4 (11)): a move-out date, a confirmation that restates the unit and the
 * date, then `POST …/notice`. The earliest date comes from the API when it sends one (CONTRACT-REQUEST #7) and is
 * never computed here; a date the API refuses comes back as `compliance.notice_period` and is shown with its legal
 * reference. The recorded notice is the document the API keeps (`notice.evidenceDocumentIds`).
 */
export function NoticeForm({
  lease,
  earliest,
  locale,
}: {
  lease: Pick<ResidentLease, "id" | "unitNo" | "buildingName">;
  earliest: string | null;
  locale: Locale;
}) {
  const t = useTranslations("resident.lease.noticeForm");
  const router = useRouter();
  const [date, setDate] = useState(earliest ?? "");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<ResidentLease | null>(null);

  if (done?.notice) {
    return (
      <div className="flex flex-col gap-5 py-6" data-testid="notice-done">
        <h1 className="font-display text-2xl font-semibold">{t("done.title")}</h1>
        <Callout tone="success" icon={IconCheckCircle} title={t("done.calloutTitle")}>
          {t("done.body", {
            unit: done.unitNo,
            date: done.notice.effectiveDate ? formatDate(done.notice.effectiveDate, locale, { style: "long" }) : "—",
          })}
        </Callout>
        <p className="text-muted text-sm">{t("done.document")}</p>
        <Button asChild size="lg" block iconEnd={IconForward}>
          <Link href={`/lease/${done.id}`}>{t("done.back")}</Link>
        </Button>
        <Button asChild variant="secondary" size="lg" block>
          <Link href="/profile#documents">{t("done.documents")}</Link>
        </Button>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = unwrap(
        await browserApi.POST("/v1/resident/leases/{leaseId}/notice", {
          params: { path: { leaseId: lease.id } },
          body: { effectiveDate: date, reason: reason.trim() || null },
        }),
      );
      setDone(result);
      router.refresh();
    } catch (caught) {
      if (!isApiError(caught)) throw caught;
      setError(caught);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 py-6" data-testid="notice-form">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      {confirming ? (
        <Card as="section" padding="md" aria-labelledby="notice-confirm-title" data-testid="notice-confirm">
          <h2 id="notice-confirm-title" className="font-semibold">
            {t("confirm.title")}
          </h2>
          <p className="mt-2">
            {t("confirm.body", {
              unit: lease.unitNo,
              building: lease.buildingName,
              date: formatDate(date, locale, { style: "long" }),
            })}
          </p>
          {reason.trim() ? (
            <p className="text-muted mt-2 text-sm">{t("confirm.reason", { reason: reason.trim() })}</p>
          ) : null}
          <p className="text-muted mt-2 text-sm">{t("confirm.final")}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Button size="lg" block loading={busy} onClick={() => void submit()} data-testid="notice-submit">
              {t("confirm.submit")}
            </Button>
            <Button variant="ghost" size="lg" block iconStart={IconBack} onClick={() => setConfirming(false)}>
              {t("confirm.change")}
            </Button>
          </div>
        </Card>
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!date) return;
            setError(null);
            setConfirming(true);
          }}
        >
          <Field
            label={t("date")}
            hint={
              earliest ? t("dateHint", { date: formatDate(earliest, locale, { style: "long" }) }) : t("dateHintNone")
            }
            error={error?.fieldError("effectiveDate")}
            required
          >
            <Input
              type="date"
              name="effectiveDate"
              value={date}
              min={earliest ?? undefined}
              onChange={(event) => setDate(event.target.value)}
              inputSize="lg"
              data-testid="notice-date"
            />
          </Field>
          <Field label={t("reason")} hint={t("reasonHint")}>
            <Textarea
              name="reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {error && !error.fieldError("effectiveDate") ? <ProblemCallout error={error} /> : null}
          <Button type="submit" size="lg" block iconStart={IconCalendar} disabled={!date} data-testid="notice-review">
            {t("review")}
          </Button>
        </form>
      )}
    </div>
  );
}
