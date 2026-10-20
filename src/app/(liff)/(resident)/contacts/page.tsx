import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ContactList } from "@/features/resident/community/Contacts";
import { loadContacts } from "@/features/resident/community/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.community.contacts");
  return { title: t("title") };
}

/** Contacts of the selected unit's building and landlord (L4 4.2 §2, D-073). */
export default async function ContactsPage() {
  const actor = await getActor();
  if (actor.status !== "signed-in") return null;
  if (!actor.unit) notFound();
  const loaded = await loadContacts(actor.unit.unitId);
  return (
    <ResidentShell active={null}>
      {loaded.error ? <ProblemPage error={loaded.error} /> : <ContactList contacts={loaded.data} />}
    </ResidentShell>
  );
}
