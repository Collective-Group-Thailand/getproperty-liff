"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { IconLogOut } from "@/ui/icons/glyphs/log-out";

/**
 * Sign out of every session this browser holds (BFF `/auth/logout`). A failure (no connection) is shown and the
 * button comes back, so the resident can try again (review M1). `signOut` is loaded on tap: /profile is at its JS
 * budget (D-179).
 */
export function SignOutButton() {
  const t = useTranslations("resident.profile");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <>
      {error ? <ProblemCallout error={error} /> : null}
      <Button
        variant="ghost"
        size="lg"
        block
        loading={busy}
        iconStart={IconLogOut}
        data-testid="profile-sign-out"
        onClick={async () => {
          setBusy(true);
          setError(null);
          let leaving = false;
          try {
            await (await import("@/lib/auth/signOut")).signOut();
            leaving = true;
            router.replace("/signed-out");
            router.refresh();
          } catch (caught) {
            setError(toApiError(caught));
          } finally {
            if (!leaving) setBusy(false);
          }
        }}
      >
        {t("signOut")}
      </Button>
    </>
  );
}
