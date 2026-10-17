import { ResidentShell } from "@/features/resident/shell/ResidentShell";

/**
 * Unknown paths (`[...rest]`) render their not-found page inside the resident shell. The shell lives in this
 * group's layout rather than in the root `not-found.tsx` (D-179): a root boundary's client components ship with
 * every page, and the bundler cannot share them with the page's own copy of the shell.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <ResidentShell active={null}>{children}</ResidentShell>;
}
