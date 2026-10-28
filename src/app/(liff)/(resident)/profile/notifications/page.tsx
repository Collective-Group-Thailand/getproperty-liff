import { getTranslations } from "next-intl/server";

import { NotificationPreferences } from "@/features/resident/profile/NotificationPreferences";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { Card } from "@/ui/components/Card";

export async function generateMetadata() {
  const t = await getTranslations("resident.profile.notifications");
  return { title: t("title") };
}

/**
 * Notification preferences per topic and channel (L3 3.3 §2) on their own page since GL3: the form and its checkboxes
 * left `/profile`, which has no budget headroom (D-179) — the profile shows a summary and links here.
 */
export default async function NotificationsPage() {
  const [t, api] = await Promise.all([getTranslations("resident.profile"), serverApi()]);
  const { data, error, response } = await api.GET("/v1/resident/me/notification-preferences");
  return (
    <ResidentShell active="me">
      <BackLink href="/profile">{t("title")}</BackLink>
      {data ? (
        <div className="flex flex-col gap-4 py-5">
          <h1 className="font-display text-2xl font-semibold">{t("notifications.title")}</h1>
          <Card as="section" padding="md">
            <NotificationPreferences initial={data.items} />
          </Card>
        </div>
      ) : (
        <ProblemPage error={problemFromParsed(response, error)} />
      )}
    </ResidentShell>
  );
}
