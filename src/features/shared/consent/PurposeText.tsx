import { markdownBlocks } from "@/features/shared/recommendations/model";
import { Card } from "@/ui/components/Card";

/**
 * A consent purpose's text exactly as the API returns it (D-025): title, the plain-language Markdown body (as text
 * runs — never HTML) and its version. Purposes of Collective are published in Thai and English only (⚖ drafts): the
 * page asks for English unless the reader reads Thai and says so with `englishNote` — legal wording is never
 * translated here (GL1's O-023, O-035 (d)). The labels come from the caller's namespace.
 */
export function PurposeText({
  title,
  bodyMarkdown,
  language,
  heading,
  versionLabel,
  englishNote,
  testId,
}: {
  title: string;
  bodyMarkdown: string;
  /** The language of the text as requested (`th` for Thai readers, else `en`). */
  language: "th" | "en";
  heading: string;
  versionLabel: string;
  /** Shown when the reader's language is neither Thai nor English. */
  englishNote: string | null;
  testId: string;
}) {
  const id = `${testId}-title`;
  return (
    <Card as="section" padding="md" aria-labelledby={id} data-testid={testId}>
      <p className="text-muted text-sm">{heading}</p>
      <h2 id={id} className="mt-1 text-lg font-semibold" lang={language}>
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-sm" lang={language} data-testid={`${testId}-body`}>
        {markdownBlocks(bodyMarkdown).map((runs, index) => (
          <p key={index}>
            {runs.map((run, i) => (run.strong ? <strong key={i}>{run.text}</strong> : <span key={i}>{run.text}</span>))}
          </p>
        ))}
      </div>
      <p className="text-muted mt-3 text-xs" data-testid={`${testId}-version`}>
        {versionLabel}
      </p>
      {englishNote ? (
        <p className="text-muted mt-1 text-xs" data-testid={`${testId}-english`}>
          {englishNote}
        </p>
      ) : null}
    </Card>
  );
}
