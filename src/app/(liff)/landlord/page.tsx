import { getTranslations } from "next-intl/server";

import { loadToday } from "@/features/landlord/data";
import { LandlordHome } from "@/features/landlord/LandlordHome";
import { NotLandlord } from "@/features/landlord/NotLandlord";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { requireLandlord } from "@/lib/auth/guards";
import { serverEnv } from "@/lib/env";

export async function generateMetadata() {
  const t = await getTranslations("landlord.home");
  return { title: t("title") };
}

/** A landlord's day in LINE (L5 5.3, D-251). */
export default async function LandlordPage() {
  const actor = await requireLandlord({ path: "/landlord" });
  const consoleUrl = serverEnv().OWNER_CONSOLE_URL;
  if (actor.status === "error") return <ProblemPage error={actor.error} />;
  if (actor.status === "not-landlord") return <NotLandlord consoleUrl={consoleUrl} />;
  if (actor.status !== "signed-in") return null;
  const today = await loadToday();
  if (today.error) return <ProblemPage error={today.error} />;
  return <LandlordHome today={today.data} name={actor.me.user.displayName} consoleUrl={consoleUrl} />;
}
