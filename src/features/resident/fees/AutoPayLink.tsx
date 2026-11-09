import Link from "next/link";

import { Icon } from "@/ui/icons";
import { IconRepeat } from "@/ui/icons/glyphs/repeat";

/**
 * "Set up yearly auto-pay" as a quiet text link with the repeat icon (J-DESIGN §3: not a sparkle). The caller renders
 * it only where the API says auto-pay can be set up (`ResidentMeUnitDto.recurringAvailable`, CR #44, D-335).
 */
export function AutoPayLink({ unitId, label, meta }: { unitId: string; label: string; meta?: string }) {
  return (
    <Link
      href={`/units/${unitId}/auto-pay`}
      className="text-primary mx-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium"
      data-testid="fees-autopay"
    >
      <Icon icon={IconRepeat} />
      <span>{label}</span>
      {meta ? <span className="text-muted font-normal">· {meta}</span> : null}
    </Link>
  );
}
