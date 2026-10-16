import { ResidentHome } from "@/features/resident/home/ResidentHome";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";

export default function HomePage() {
  return (
    <ResidentShell active="home">
      <ResidentHome />
    </ResidentShell>
  );
}
