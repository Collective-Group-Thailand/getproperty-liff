"use client";

import { openExternal } from "@/lib/liff/client";
import { Button } from "@/ui/components/Button";
import { IconExternal } from "@/ui/icons/glyphs/external";

/** A link that leaves the app — opened the LIFF way (`liff.openWindow`, external), never `window.open`. */
export function ExternalLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      variant="link"
      size="sm"
      className="h-auto min-h-12 px-0"
      iconStart={IconExternal}
      onClick={() => void openExternal(href)}
    >
      {children}
    </Button>
  );
}
