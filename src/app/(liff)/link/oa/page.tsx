import { getTranslations } from "next-intl/server";

import { OaLinkConfirm } from "@/features/resident/link/OaLinkConfirm";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { requireResident } from "@/lib/auth/guards";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("resident.link.oa");
  return { title: t("title") };
}

/**
 * Linking an operator's own LINE Official Account (D-254): following the OA (or writing to it) gets a reply with
 * `/link/oa?t=…`; signed in, the resident sees who asks and confirms with one tap. Until then the operator's
 * messages keep coming from the getproperty OA, so nothing is lost by waiting.
 */
export default async function OaLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t.trim().slice(0, 128) : "";
  await requireResident({ path: token ? `/link/oa?t=${encodeURIComponent(token)}` : "/link/oa" });
  const t = await getTranslations("resident.link.oa");
  if (!token) {
    return (
      <ResidentShell active={null} chrome="entry">
        <div className="py-6" data-testid="oa-link-missing">
          <Callout tone="warning" title={t("invalid.title")}>
            {t("invalid.body")}
          </Callout>
        </div>
      </ResidentShell>
    );
  }
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/messaging-links/{token}", {
    params: { path: { token } },
  });
  if (!data) {
    const problem = problemFromParsed(response, error);
    return (
      <ResidentShell active={null} chrome="entry">
        {problem.code === "messaging.link_invalid" ? (
          <div className="py-6" data-testid="oa-link-invalid">
            <Callout tone="warning" title={t("invalid.title")}>
              {t("invalid.body")}
            </Callout>
          </div>
        ) : (
          <ProblemPage error={problem} />
        )}
      </ResidentShell>
    );
  }
  return (
    <ResidentShell active={null} chrome="entry">
      <OaLinkConfirm token={token} link={data} />
    </ResidentShell>
  );
}
