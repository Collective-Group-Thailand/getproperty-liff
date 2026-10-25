import { ProspectShell } from "@/features/prospect/ProspectShell";
import { getProspect } from "@/lib/auth/actor";

export const dynamic = "force-dynamic";

/** The prospect screens (L5, D-252): their own frame and session — no resident nav, no resident session needed. */
export default async function RentLayout({ children }: { children: React.ReactNode }) {
  const actor = await getProspect();
  return <ProspectShell signedIn={actor.status === "signed-in"}>{children}</ProspectShell>;
}
