import { ProblemPage } from "@/features/shared/ProblemNotice";
import { TechnicianShell } from "@/features/technician/TechnicianShell";
import { requireTechnician } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Every technician screen sits behind this guard (L4 4.4 §3): a technician session of its own (separate cookies,
 * audience `technician`) — a resident's session never opens these screens, and the technician shell has no resident
 * nav. Signed out → LINE sign-in inside LINE, the technician sign-in page elsewhere.
 */
export default async function TechnicianAppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireTechnician();
  // Each screen renders its own frame (the job page has a back bar and a docked next step instead of the logo).
  return actor.status === "error" ? (
    <TechnicianShell>
      <ProblemPage error={actor.error} />
    </TechnicianShell>
  ) : (
    children
  );
}
