"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth/client";
import { Button } from "@/ui/components/Button";
import { IconLogOut } from "@/ui/icons/glyphs/log-out";

/** Sign out of every session this browser holds (BFF `/auth/logout`). */
export function SignOutButton() {
  const t = useTranslations("resident.profile");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="lg"
      block
      loading={busy}
      iconStart={IconLogOut}
      onClick={async () => {
        setBusy(true);
        await signOut();
        router.replace("/signed-out");
        router.refresh();
      }}
    >
      {t("signOut")}
    </Button>
  );
}
