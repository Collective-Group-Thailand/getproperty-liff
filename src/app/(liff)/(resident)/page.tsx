import { ResidentHome } from "@/features/resident/home/ResidentHome";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { getActor } from "@/lib/auth/actor";

/** Resident home, from `/v1/resident/me` (the `(resident)` layout has already checked session and consent). */
export default async function HomePage() {
  const actor = await getActor();
  if (actor.status !== "signed-in") return null;
  return (
    <ResidentShell active="home">
      <ResidentHome me={actor.me} unit={actor.unit} entitlements={actor.entitlements} />
    </ResidentShell>
  );
}
