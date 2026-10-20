"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/ui/components/Button";
import { IconCheck } from "@/ui/icons/glyphs/check";
import { IconCopy } from "@/ui/icons/glyphs/copy";

/**
 * Copies the landlord's full account number (`ResidentAccountDto.accountNo`, sent only while something is due, D-209)
 * so the resident can paste it into a banking app — the masked number cannot be typed in. The digits are the API's.
 */
export function CopyAccount({ accountNo }: { accountNo: string }) {
  const t = useTranslations("resident.pay");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      className="mt-2"
      iconStart={copied ? IconCheck : IconCopy}
      data-testid="pay-copy-account"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(accountNo);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-live="polite">{copied ? t("accountCopied") : t("copyAccount")}</span>
    </Button>
  );
}
