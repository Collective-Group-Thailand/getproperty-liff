"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import type { NotificationPreference } from "@/lib/api/types";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Checkbox } from "@/ui/components/Checkbox";
import { toast } from "@/ui/components/Toast";

/**
 * Notification preferences per topic and channel (LINE, SMS). Topics the API locks (bills, lease notices — the
 * resident must receive them) are shown ticked and disabled with the reason;
 * `PUT /v1/resident/me/notification-preferences` saves them (a locked topic switched off → 422).
 */
export function NotificationPreferences({ initial }: { initial: NotificationPreference[] }) {
  const t = useTranslations("resident.profile.notifications");
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const dirty = JSON.stringify(items) !== JSON.stringify(initial);

  const set = (topic: string, channel: "line" | "sms", on: boolean) =>
    setItems((current) => current.map((item) => (item.topic === topic ? { ...item, [channel]: on } : item)));

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="notification-preferences"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const saved = unwrap(
            await browserApi.PUT("/v1/resident/me/notification-preferences", {
              body: { items: items.map(({ topic, line, sms }) => ({ topic, line, sms })) },
            }),
          );
          setItems(saved.items);
          toast.success(t("saved"));
        } catch (caught) {
          if (!isApiError(caught)) throw caught;
          setError(caught);
        } finally {
          setBusy(false);
        }
      }}
    >
      <ul className="flex flex-col gap-3" role="list">
        {items.map((item) => (
          <li key={item.topic} className="border-border border-b pb-3 last:border-b-0">
            <fieldset>
              <legend className="font-medium">{t(`topic.${item.topic}`)}</legend>
              {item.locked ? <p className="text-muted text-xs">{t("locked")}</p> : null}
              <div className="mt-1 flex flex-wrap gap-x-6">
                <Checkbox
                  label={t("line")}
                  checked={item.line}
                  disabled={item.locked}
                  onCheckedChange={(checked) => set(item.topic, "line", checked === true)}
                  name={`${item.topic}-line`}
                />
                <Checkbox
                  label={t("sms")}
                  checked={item.sms}
                  disabled={item.locked}
                  onCheckedChange={(checked) => set(item.topic, "sms", checked === true)}
                  name={`${item.topic}-sms`}
                />
              </div>
            </fieldset>
          </li>
        ))}
      </ul>
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="lg" block disabled={!dirty} loading={busy} data-testid="notifications-save">
        {t("save")}
      </Button>
    </form>
  );
}
