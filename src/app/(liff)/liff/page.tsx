import { getTranslations } from "next-intl/server";

import { LiffEntry } from "@/features/resident/liff/LiffEntry";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { technicianEnabled } from "@/lib/flags";

export async function generateMetadata() {
  const t = await getTranslations("resident.liff");
  return { title: t("title") };
}

/** The LIFF endpoint URL registered in the LINE Developers console (`https://<host>/liff`). */
export default function LiffEntryPage() {
  return (
    <ResidentShell active={null} chrome="entry">
      <LiffEntry technicianEnabled={technicianEnabled()} />
    </ResidentShell>
  );
}
