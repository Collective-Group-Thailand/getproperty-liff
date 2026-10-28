import { getTranslations } from "next-intl/server";

import { ProspectShell } from "@/features/prospect/ProspectShell";
import { OaLinkConfirm } from "@/features/resident/link/OaLinkConfirm";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { getActor, getProspect } from "@/lib/auth/actor";
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
 *
 * G4 (D-296 (6)): an estate agency's OA links **prospects** too. Someone signed in as a prospect only (no resident
 * session) previews and confirms through `/v1/prospect/messaging-links/{token}` in the prospect frame; a resident
 * session keeps the resident endpoints; nobody signed in signs in as a resident, as before.
 */
export default async function OaLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t.trim().slice(0, 128) : "";
  const path = token ? `/link/oa?t=${encodeURIComponent(token)}` : "/link/oa";
  if ((await getActor()).status !== "signed-in" && (await getProspect()).status === "signed-in") {
    return <ProspectOaLink token={token} />;
  }
  await requireResident({ path });
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

/** The same page for a prospect (G4): the prospect endpoints and frame. */
async function ProspectOaLink({ token }: { token: string }) {
  const t = await getTranslations("resident.link.oa");
  const invalid = (
    <div className="py-6" data-testid={token ? "oa-link-invalid" : "oa-link-missing"}>
      <Callout tone="warning" title={t("invalid.title")}>
        {t("invalid.body")}
      </Callout>
    </div>
  );
  if (!token) return <ProspectShell signedIn>{invalid}</ProspectShell>;
  const api = await serverApi("prospect");
  const { data, error, response } = await api.GET("/v1/prospect/messaging-links/{token}", {
    params: { path: { token } },
  });
  if (!data) {
    const problem = problemFromParsed(response, error);
    return (
      <ProspectShell signedIn>
        {problem.code === "messaging.link_invalid" ? invalid : <ProblemPage error={problem} />}
      </ProspectShell>
    );
  }
  return (
    <ProspectShell signedIn>
      <OaLinkConfirm token={token} link={data} audience="prospect" />
    </ProspectShell>
  );
}
