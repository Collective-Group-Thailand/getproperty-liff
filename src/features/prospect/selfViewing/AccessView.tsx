"use client";

import { useLocale, useTranslations } from "next-intl";

import { VIEWING_ACCESS_STATUS } from "@/domain/status/viewingAccess";
import { formatDateTime, formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { IconAlert } from "@/ui/icons/glyphs/alert";
import { IconDoor } from "@/ui/icons/glyphs/door";
import { IconHide } from "@/ui/icons/glyphs/hide";
import { IconKey } from "@/ui/icons/glyphs/key";

import { accessOpen, windowPhase, type AccessSummary } from "./model";

export type AccessIntent = "code" | "arrive" | "leave" | "report";

/**
 * What the door-code panel of a self viewing shows (GL2, D-295) — the window, its state, the code when fetched and
 * the actions — without the logic: the light first paint (`LazySelfViewingAccess`) and the working panel
 * (`SelfViewingAccess`) render the same view, so the page shows the panel at once and loads the actions on first use.
 */
export function AccessView({
  access,
  now,
  code = null,
  busy = null,
  onAction,
  onHide,
  notice,
  codeRef,
}: {
  access: AccessSummary;
  now: number;
  code?: Schemas["ViewingAccessCodeDto"] | null;
  busy?: AccessIntent | null;
  onAction: (intent: AccessIntent) => void;
  onHide?: () => void;
  /** A problem or "not available now" callout under the actions. */
  notice?: React.ReactNode;
  /** The shown code's box — hidden synchronously by the panel when the page is hidden (review G, L2). */
  codeRef?: React.Ref<HTMLDivElement>;
}) {
  const t = useTranslations("prospect.selfViewing.access");
  const root = useTranslations();
  const locale = useLocale() as Locale;
  const phase = windowPhase(access, now);
  const open = accessOpen(access);

  return (
    <div className="flex flex-col gap-3" data-testid="self-access" data-state={access.state} data-phase={phase}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {t("window", { from: formatTime(access.validFrom, locale), to: formatTime(access.validTo, locale) })}
        </p>
        <StatusBadge
          status={VIEWING_ACCESS_STATUS[access.state]}
          label={root(VIEWING_ACCESS_STATUS[access.state].labelKey)}
          size="sm"
        />
      </div>

      {open ? (
        code ? (
          <div ref={codeRef} className="bg-primary-subtle rounded-card flex flex-col gap-3 p-4" data-testid="self-code">
            <p className="text-sm font-medium">{t("codeTitle")}</p>
            <p
              className="font-mono text-4xl font-semibold tracking-[0.25em] tabular-nums"
              aria-live="polite"
              data-testid="self-door-code"
            >
              {code.doorCode}
            </p>
            <ul className="flex flex-col gap-1 text-sm" role="list" data-testid="self-locks">
              {code.locks.map((lock) => (
                <li key={`${lock.scope}-${lock.name}`} className="flex items-center justify-between gap-2">
                  <span>{lock.name}</span>
                  <span className="text-muted">{lock.ready ? t("lockReady") : t("lockSyncing")}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm">{t("codeUntil", { to: formatTime(code.validTo, locale) })}</p>
            <Button variant="secondary" size="lg" block iconStart={IconHide} onClick={onHide}>
              {t("hide")}
            </Button>
          </div>
        ) : phase === "before" ? (
          <Callout tone="info" title={t("beforeTitle")}>
            {t("before", { from: formatDateTime(access.validFrom, locale) })}
          </Callout>
        ) : phase === "open" ? (
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              block
              iconStart={IconKey}
              loading={busy === "code"}
              onClick={() => onAction("code")}
              data-testid="self-show-code"
            >
              {t("show")}
            </Button>
            <p className="text-muted text-sm">{t("showHint")}</p>
          </div>
        ) : (
          <Callout tone="neutral">{t("over")}</Callout>
        )
      ) : null}

      {open && phase === "open" && access.state === "issued" ? (
        <Button
          variant="secondary"
          size="lg"
          block
          iconStart={IconDoor}
          loading={busy === "arrive"}
          onClick={() => onAction("arrive")}
          data-testid="self-arrive"
        >
          {t("arrive")}
        </Button>
      ) : null}
      {access.enteredAt ? (
        <p className="text-muted text-sm" data-testid="self-entered">
          {t(access.enteredSource === "lock_log" ? "enteredLock" : "entered", {
            time: formatTime(access.enteredAt, locale),
          })}
        </p>
      ) : null}
      {open && phase !== "before" ? (
        <Button
          size="lg"
          block
          variant={access.state === "entered" ? "primary" : "secondary"}
          loading={busy === "leave"}
          onClick={() => onAction("leave")}
          data-testid="self-leave"
        >
          {t("leave")}
        </Button>
      ) : null}

      {notice}

      {access.incidentAt ? (
        <Callout tone="success" title={t("reported.title")}>
          <span data-testid="self-incident-reported">
            {t("reported.body", { time: formatTime(access.incidentAt, locale) })}
          </span>
        </Callout>
      ) : phase !== "before" ? (
        <Button
          variant="ghost"
          size="lg"
          block
          iconStart={IconAlert}
          loading={busy === "report"}
          onClick={() => onAction("report")}
          data-testid="self-report"
        >
          {t("report")}
        </Button>
      ) : null}
    </div>
  );
}
