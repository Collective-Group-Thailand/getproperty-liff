import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ProfileView } from "@/features/resident/profile/ProfileView";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import type { NotificationPreferences, ResidentDocument } from "@/lib/api/contract-requests";
import { serverJson } from "@/lib/api/server";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.profile");
  return { title: t("title") };
}

/** The resident's profile, language, notifications and documents (L3 3.3). */
export default async function ProfilePage() {
  const [actor, locale] = await Promise.all([getActor(), pageLocale()]);
  if (actor.status !== "signed-in") return null;
  // CONTRACT-REQUEST #10 and #11: shown only when the API answers them.
  const [preferences, documents] = await Promise.all([
    serverJson<NotificationPreferences>("/v1/resident/me/notification-preferences"),
    serverJson<ResidentDocument[]>("/v1/resident/documents"),
  ]);
  return (
    <ResidentShell active="me">
      <ProfileView
        me={actor.me}
        locale={locale}
        preferences={preferences.data?.items ?? null}
        documents={documents.data ?? null}
      />
    </ResidentShell>
  );
}
