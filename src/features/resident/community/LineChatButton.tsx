"use client";

import { openExternal } from "@/lib/liff/client";
import { Button } from "@/ui/components/Button";
import { IconChat } from "@/ui/icons/glyphs/chat";

import { lineChatUrl } from "./lineLink";

/** Opens the contact's LINE chat inside LINE (`liff.openWindow`), never `window.open`. */
export function LineChatButton({
  lineId,
  label,
  children,
}: {
  lineId: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="secondary"
      size="lg"
      iconStart={IconChat}
      aria-label={label}
      onClick={() => void openExternal(lineChatUrl(lineId), { external: false })}
      data-testid="contact-line"
    >
      {children}
    </Button>
  );
}
