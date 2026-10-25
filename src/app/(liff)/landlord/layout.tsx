import { LandlordShell } from "@/features/landlord/LandlordShell";
import { getLandlord } from "@/lib/auth/actor";

export const dynamic = "force-dynamic";

/** The landlord's quick actions (L5 5.3, D-251): their own frame and operator session. */
export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  const actor = await getLandlord();
  return (
    <LandlordShell signedIn={actor.status === "signed-in" || actor.status === "not-landlord"}>{children}</LandlordShell>
  );
}
