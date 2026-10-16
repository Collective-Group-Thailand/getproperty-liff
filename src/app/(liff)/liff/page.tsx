import { getTranslations } from "next-intl/server";

import { LiffEntry } from "@/features/resident/liff/LiffEntry";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";

export async function generateMetadata() {
  const t = await getTranslations("resident.liff");
  return { title: t("title") };
}

/** The LIFF endpoint URL registered in the LINE Developers console (`https://<host>/liff`). */
export default function LiffEntryPage() {
  return (
    <ResidentShell active={null}>
      <LiffEntry />
    </ResidentShell>
  );
}
