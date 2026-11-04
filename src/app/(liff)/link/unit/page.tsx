import { getTranslations } from "next-intl/server";

import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { UnitRedeem } from "@/features/resident/units/UnitRedeem";
import { isClosing, redeemProblem } from "@/features/resident/units/redeem";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireResident } from "@/lib/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("resident.link.unitInvite");
  return { title: t("title") };
}

/** Invitation codes as the API issues them (letters, digits, dashes); anything else is not looked up. */
function cleanCode(raw: string | string[] | undefined): string {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^[A-Z0-9-]{4,64}$/.test(value) ? value : "";
}

/**
 * A co-owner's unit invitation (JRL, D-322): the office's QR / SMS / link opens `/link/unit?code=…` (the API's
 * `PUBLIC_RESIDENT_APP_URL/link/unit`); the LIFF entry signs the resident in and the guard asks for the required
 * consents first. The preview is read on the server; an unknown or used code shows its own screen at once.
 */
export default async function UnitInvitationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const code = cleanCode((await searchParams).code);
  await requireResident({ path: code ? `/link/unit?code=${encodeURIComponent(code)}` : "/link/unit" });
  if (!code) {
    return (
      <ResidentShell active={null} chrome="entry">
        <UnitRedeem
          code=""
          preview={null}
          initial={{ step: "closed", problem: redeemProblem("invitation.not_found") }}
        />
      </ResidentShell>
    );
  }
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/unit-invitations/{code}", {
    params: { path: { code } },
  });
  const problem = data ? null : problemFromParsed(response, error);
  const closing = problem ? redeemProblem(problem.code) : null;
  return (
    <ResidentShell active={null} chrome="entry">
      {problem && closing && !isClosing(closing.kind) ? (
        <ProblemPage error={problem} />
      ) : (
        <UnitRedeem
          code={code}
          preview={data ?? null}
          initial={closing ? { step: "closed", problem: closing } : undefined}
        />
      )}
    </ResidentShell>
  );
}
