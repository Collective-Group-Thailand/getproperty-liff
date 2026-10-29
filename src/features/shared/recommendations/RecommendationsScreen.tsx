import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ApiError } from "@/lib/api/problem";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconBell } from "@/ui/icons/glyphs/bell";
import { IconForward } from "@/ui/icons/glyphs/forward";

import { ConsentText } from "./ConsentText";
import { HistoryList } from "./HistoryList";
import { LazyPreferencesForm } from "./LazyPreferencesForm";
import {
  basePath,
  consentState,
  HISTORY_PREVIEW,
  type HistoryItem,
  type PublicArea,
  type Recommendations,
  type RecommendationsAudience,
} from "./model";
import { WithdrawButton } from "./WithdrawButton";

/**
 * Recommended places (GL1, D-300) — the same screen for residents (`/recommendations`, the LINE message's link) and
 * prospects (`/rent/recommendations`): where I stand with the one-tap stop first, the consent text as the API words
 * it, what I want to hear about (form, loaded near the screen), how often and when not, and what was sent to me.
 */
export async function RecommendationsScreen({
  audience,
  data,
  areas,
  history,
  locale,
  notice,
}: {
  audience: RecommendationsAudience;
  data: Recommendations;
  areas: PublicArea[] | null;
  history: { items: HistoryItem[]; total: number } | { error: ApiError };
  locale: Locale;
  notice: "saved" | "stopped" | null;
}) {
  const t = await getTranslations("recommendations");
  const state = consentState(data.consent);
  const own = data.preferences?.quietHours ?? null;
  return (
    <div className="flex flex-col gap-5 py-5" data-testid="recommendations" data-state={state} data-audience={audience}>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      {notice === "stopped" && state !== "on" ? (
        <Callout tone="success" title={t("stopped.title")} className="scroll-mt-4">
          <span data-testid="recommendations-stopped">{t("stopped.body")}</span>
        </Callout>
      ) : null}
      {notice === "saved" && state === "on" ? (
        <Callout tone="success" title={t("saved.title")}>
          <span data-testid="recommendations-saved">{t("saved.body")}</span>
        </Callout>
      ) : null}

      <Card as="section" padding="md" className="flex flex-col gap-4" data-testid="recommendations-status">
        <div className="flex items-start gap-3">
          <span
            className={
              state === "on"
                ? "bg-primary-subtle text-primary-subtle-fg flex size-10 shrink-0 items-center justify-center rounded-full"
                : "bg-surface-subtle text-muted flex size-10 shrink-0 items-center justify-center rounded-full"
            }
          >
            <Icon icon={IconBell} className="text-xl" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{t(`status.${state}.title`)}</h2>
              {state === "outdated" ? (
                <Badge tone="warning" size="sm">
                  {t("consent.version", { version: data.consent.version })}
                </Badge>
              ) : null}
            </div>
            <p className="text-muted text-sm">
              {state === "on"
                ? t("status.on.body", {
                    date: data.consent.capturedAt ? formatDate(data.consent.capturedAt, locale) : "—",
                  })
                : state === "outdated"
                  ? t("status.outdated.body", { version: data.consent.version })
                  : t("status.off.body")}
            </p>
          </div>
        </div>
        {/* D-025 / D-300 (1): stopping is as easy as agreeing — whenever an agreement is on file, in any version. */}
        {state !== "off" ? <WithdrawButton audience={audience} outdated={state === "outdated"} /> : null}
      </Card>

      <ConsentText consent={data.consent} locale={locale} />

      <Card
        as="section"
        padding="md"
        aria-labelledby="recommendations-limits-title"
        data-testid="recommendations-limits"
      >
        <h2 id="recommendations-limits-title" className="font-semibold">
          {t("limits.title")}
        </h2>
        <ul className="text-muted mt-2 flex list-disc flex-col gap-1 ps-5 text-sm" role="list">
          <li>{t("limits.cap", { count: data.maxPerWeek })}</li>
          <li>
            {own
              ? t("limits.quietOwn", { start: own.start, end: own.end })
              : t("limits.quiet", { start: data.quietHours.start, end: data.quietHours.end })}
          </li>
        </ul>
      </Card>

      <LazyPreferencesForm
        key={`${state}-${data.preferences?.updatedAt ?? "none"}`}
        audience={audience}
        data={data}
        areas={areas}
        locale={locale}
      />

      <Card as="section" padding="md" aria-labelledby="recommendations-history-title">
        <h2 id="recommendations-history-title" className="font-semibold">
          {t("history.title")}
        </h2>
        {"error" in history ? (
          <p className="text-muted mt-2 text-sm">{t("history.unavailable")}</p>
        ) : history.items.length === 0 ? (
          <p className="text-muted mt-2 text-sm" data-testid="recommendations-history-empty">
            {t("history.empty")}
          </p>
        ) : (
          <>
            <HistoryList items={history.items.slice(0, HISTORY_PREVIEW)} locale={locale} />
            {history.total > HISTORY_PREVIEW ? (
              <Button asChild variant="secondary" size="lg" block iconEnd={IconForward} className="mt-2">
                <Link href={`${basePath(audience)}/history`} data-testid="recommendations-history-all">
                  {t("history.all")}
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
