import { useTranslations } from "next-intl";

import type { ApiError } from "@/lib/api/problem";
import { Callout } from "@/ui/components/Callout";
import { ErrorState } from "@/ui/components/ErrorState";

/**
 * How an API problem reaches a resident (CLAUDE.md): the API's own localised `title`/`detail`; a `compliance.*`
 * refusal with its legal reference, never worked around; the request id small, so support can find the log.
 * BFF and network failures (`bff.*`, no body) get this app's copy instead.
 */
function copyFor(error: ApiError, t: (key: string) => string) {
  if (error.code === "bff.upstream_unavailable" || error.status === 503 || error.status === 502) {
    return { title: t("unavailable.title"), body: t("unavailable.body") };
  }
  if (error.status === 401) return { title: t("session.title"), body: t("session.body") };
  return { title: error.title || t("generic.title"), body: error.detail || t("generic.body") };
}

export function ComplianceNotice({ error }: { error: ApiError }) {
  const t = useTranslations("errors");
  return (
    <Callout
      tone="danger"
      title={error.title || t("generic.title")}
      legalRef={error.legalRef ? `${t("legalRef")}: ${error.legalRef}` : undefined}
    >
      {error.detail}
    </Callout>
  );
}

/** Inline, inside a form or a card. */
export function ProblemCallout({ error, action }: { error: ApiError; action?: React.ReactNode }) {
  const t = useTranslations("errors");
  const common = useTranslations("common");
  if (error.isCompliance) return <ComplianceNotice error={error} />;
  const copy = copyFor(error, t);
  return (
    <Callout tone="danger" title={copy.title} action={action}>
      <span>{copy.body}</span>
      {error.requestId ? (
        <span className="mt-1 block font-mono text-xs">
          {common("requestId")}: {error.requestId}
        </span>
      ) : null}
    </Callout>
  );
}

/** A whole page that could not load. */
export function ProblemPage({ error, action }: { error: ApiError; action?: React.ReactNode }) {
  const t = useTranslations("errors");
  const common = useTranslations("common");
  const copy = copyFor(error, t);
  // The request id is rendered here rather than by ErrorState's `requestId`: its `text-subtle` 12-px text is below
  // 4.5:1 on the page background (axe) — reported upstream to getproperty-web (docs/PROGRESS.md).
  return (
    <ErrorState
      title={copy.title}
      description={
        <>
          {copy.body}
          {error.requestId ? (
            <span className="mt-3 block font-mono text-xs">
              {common("requestId")}: {error.requestId}
            </span>
          ) : null}
        </>
      }
      action={action}
    />
  );
}
