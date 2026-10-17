import Link from "next/link";

import { Icon } from "@/ui/icons";
import { IconBack } from "@/ui/icons/glyphs/back";

/** "← Lease" at the top of a sub-page: a real link (48-px target), so it works without JavaScript and in LINE. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-primary -ml-2 inline-flex min-h-12 items-center gap-1 self-start px-2 font-medium"
      data-testid="back-link"
    >
      <Icon icon={IconBack} />
      {children}
    </Link>
  );
}
