"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconChat } from "@/ui/icons/glyphs/chat";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconLink } from "@/ui/icons/glyphs/link";
import { IconWrench } from "@/ui/icons/glyphs/wrench";

type Link = Schemas["MessagingLinkDto"];

/** Problems that end the link: shown as their own state instead of a generic error. */
const ENDED: Record<string, "used" | "expired" | "taken"> = {
  "messaging.link_used": "used",
  "messaging.link_expired": "expired",
  "messaging.line_user_taken": "taken",
};

/**
 * One tap to receive an operator's messages through its own LINE OA (D-254). The resident sees who asks (the
 * operator and the OA's name and picture) and what moves there; a used or expired link says what to do instead.
 * Nothing is linked by opening the page (`POST /v1/resident/messaging-links/{token}/actions/confirm`). A prospect (an
 * estate agency's OA, G4) confirms through `/v1/prospect/messaging-links/{token}/actions/confirm` and goes back to
 * their enquiries.
 */
export function OaLinkConfirm({
  token,
  link,
  audience = "resident",
}: {
  token: string;
  link: Link;
  audience?: "resident" | "prospect";
}) {
  const t = useTranslations("resident.link.oa");
  const router = useRouter();
  const [state, setState] = useState<Link["state"] | "linked" | "taken">(link.state);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const oaName = link.botName ?? link.tenantName;
  // A prospect reads about enquiries and viewings, not bills and repairs (G4: an estate agency's OA).
  const copy = (key: "title" | "lead" | "done.body" | "done.home" | "taken.body") =>
    audience === "prospect" ? `prospect.${key}` : key;

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      const params = { params: { path: { token } } };
      unwrap(
        audience === "prospect"
          ? await browserApi.POST("/v1/prospect/messaging-links/{token}/actions/confirm", params)
          : await browserApi.POST("/v1/resident/messaging-links/{token}/actions/confirm", params),
      );
      setState("linked");
    } catch (caught) {
      const problem = toApiError(caught);
      const ended = problem.code ? ENDED[problem.code] : undefined;
      if (ended) setState(ended);
      else setError(problem);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <Card padding="md" className="flex items-center gap-3" data-testid="oa-link-who">
      {link.botPictureUrl ? (
        // A LINE profile image (any host): a plain <img>, sized by tokens.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={link.botPictureUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="bg-primary-subtle text-primary-subtle-fg flex size-12 shrink-0 items-center justify-center rounded-full">
          <Icon icon={IconChat} className="text-2xl" />
        </span>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{oaName}</span>
        <span className="text-muted truncate text-sm">{t("by", { name: link.tenantName })}</span>
      </div>
    </Card>
  );

  if (state === "linked") {
    return (
      <div className="flex flex-col gap-5 py-6" data-testid="oa-link-done">
        <Callout tone="success" title={t("done.title")}>
          {t(copy("done.body"), { name: oaName })}
        </Callout>
        {header}
        <Button
          size="lg"
          block
          iconEnd={IconForward}
          onClick={() => {
            router.replace(audience === "prospect" ? "/rent/enquiries" : "/");
            router.refresh();
          }}
          data-testid="oa-link-home"
        >
          {t(copy("done.home"))}
        </Button>
      </div>
    );
  }

  if (state !== "valid") {
    return (
      <div className="flex flex-col gap-5 py-6" data-testid="oa-link-ended" data-state={state}>
        <Callout tone="warning" title={t(`${state}.title`)}>
          {t(state === "taken" ? copy("taken.body") : `${state}.body`, { name: oaName })}
        </Callout>
        {header}
      </div>
    );
  }

  const gains =
    audience === "prospect"
      ? [
          { icon: IconChat, text: t("prospect.gains.replies") },
          { icon: IconCalendar, text: t("prospect.gains.viewings") },
        ]
      : [
          { icon: IconBill, text: t("gains.bills") },
          { icon: IconWrench, text: t("gains.repairs") },
          { icon: IconChat, text: t("gains.news") },
        ];

  return (
    <div className="flex flex-col gap-5 py-6" data-testid="oa-link" data-audience={audience}>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t(copy("title"))}</h1>
        <p className="text-muted">{t(copy("lead"), { name: link.tenantName })}</p>
      </div>
      {header}
      <ul className="flex flex-col gap-3" role="list" aria-label={t("gains.label")}>
        {gains.map((gain) => (
          <li key={gain.text} className="flex items-start gap-3">
            <Icon icon={gain.icon} className="text-primary mt-0.5 shrink-0 text-xl" />
            <span>{gain.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted text-sm">{t("note")}</p>
      {error ? <ProblemCallout error={error} /> : null}
      <Button size="lg" block loading={busy} iconStart={IconLink} onClick={confirm} data-testid="oa-link-confirm">
        {t("confirm")}
      </Button>
    </div>
  );
}
