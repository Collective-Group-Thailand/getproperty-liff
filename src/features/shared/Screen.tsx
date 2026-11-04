import Link from "next/link";

import { cn } from "@/ui/lib/cn";
import { Icon, type IconGlyph } from "@/ui/icons";
import { IconBack } from "@/ui/icons/glyphs/back";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

/**
 * The resident app's page frame (redesign G2): every screen is a column of a header, sections and — when the screen
 * has a task — one docked primary action. These pieces carry the spacing (8-px grid: 8 inside a section head, 24
 * between sections) so screens never set their own rhythm.
 */

/** The column every screen renders into: the header, then sections 24 px apart. */
export function Screen({
  children,
  className,
  testId,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div className={cn("flex flex-1 flex-col gap-6 pt-2 pb-8", className)} data-testid={testId} {...rest}>
      {children}
    </div>
  );
}

/**
 * Back link, title, one line of lede. The back link is a real link (works without JavaScript and inside LINE) with a
 * 44-px target; it is quiet (muted ink), never a second brand-coloured action. `status` sits beside the title (one
 * badge), `meta` under the lede (a document number, a date range) in small muted text.
 */
export function ScreenHeader({
  back,
  title,
  lede,
  status,
  meta,
  titleId,
  className,
  flush,
}: {
  back?: { href: string; label: string };
  /** A record screen under the back bar: no extra top inset. */
  flush?: boolean;
  title: React.ReactNode;
  lede?: React.ReactNode;
  status?: React.ReactNode;
  meta?: React.ReactNode;
  titleId?: string;
  className?: string;
}) {
  return (
    // Record screens carry the way back in the top bar (redesign G2 r2) and the frame adds its own top inset there, so
    // a header without a back link only needs the 16-px lead on the tab screens (`flush` on record screens).
    <header className={cn("flex flex-col", back || flush ? "pt-0" : "pt-4", className)}>
      {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}
      <div className="flex items-start justify-between gap-3">
        <h1 id={titleId} className="font-display min-w-0 text-2xl font-semibold text-balance">
          {title}
        </h1>
        {status ? <div className="flex shrink-0 items-center gap-1.5 pt-1.5">{status}</div> : null}
      </div>
      {lede ? <p className="text-muted mt-1 text-base text-pretty">{lede}</p> : null}
      {meta ? <div className="text-muted mt-1 text-sm">{meta}</div> : null}
    </header>
  );
}

/** "‹ Bills": the way back from a sub-page — muted, 44-px tall, the chevron flips in RTL. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-muted hover:text-fg -ms-2 inline-flex min-h-11 items-center gap-1 self-start px-2 text-sm font-medium"
      data-testid="back-link"
    >
      <Icon icon={IconBack} className="rtl:rotate-180" />
      {children}
    </Link>
  );
}

/** A titled block of a screen. The title is small and muted — the content carries the weight, not the label. */
export function Section({
  title,
  titleId,
  action,
  children,
  className,
  testId,
  ...rest
}: {
  title?: React.ReactNode;
  titleId?: string;
  /** One quiet link at the end of the heading ("All bills"). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children" | "title">) {
  return (
    <section
      aria-labelledby={title && titleId ? titleId : undefined}
      className={cn("flex flex-col gap-2", className)}
      data-testid={testId}
      {...rest}
    >
      {title || action ? (
        <div className="flex min-h-6 items-baseline justify-between gap-3">
          {title ? (
            <h2 id={titleId} className="text-muted text-sm font-semibold">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The quiet text link of a section heading. */
export function SectionLink({ href, children, testId }: { href: string; children: React.ReactNode; testId?: string }) {
  return (
    <Link
      href={href}
      className="text-primary -me-2 inline-flex min-h-11 items-center gap-0.5 px-2 text-sm font-medium"
      data-testid={testId}
    >
      {children}
      <Icon icon={IconChevronRight} className="rtl:rotate-180" />
    </Link>
  );
}

export interface ListRow {
  key: string;
  href?: string;
  icon?: IconGlyph;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** The figure or the status at the end of the row (money right-aligned in tabular numerals). */
  end?: React.ReactNode;
  /** A second line under `end` (a status under an amount). */
  endMeta?: React.ReactNode;
  testId?: string;
  /** Extra attributes for the row element (data-* the tests read). */
  data?: Record<`data-${string}`, string | undefined>;
  /** Bold title: something new or unread. */
  strong?: boolean;
}

/**
 * Records and menu entries as rows in one card, hairlines between them; the whole row is the target (≥ 56 px).
 * Never a card per row, never a button per row.
 */
export function List({
  rows,
  label,
  className,
  testId,
}: {
  rows: ListRow[];
  /** Accessible name of the list, from `src/i18n`. */
  label?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn("rounded-card border-border bg-surface shadow-card divide-border divide-y border", className)}
      data-testid={testId}
    >
      {rows.map((row) => {
        const body = (
          <>
            {row.icon ? (
              <span className="text-muted grid size-6 shrink-0 place-items-center text-xl" aria-hidden="true">
                <Icon icon={row.icon} />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn("break-words", row.strong ? "font-semibold" : "font-medium")}>{row.title}</span>
              {row.meta ? <span className="text-muted text-sm">{row.meta}</span> : null}
            </span>
            {row.end || row.endMeta ? (
              <span className="flex shrink-0 flex-col items-end gap-1 text-end">
                {row.end ? <span className="font-medium tabular-nums">{row.end}</span> : null}
                {row.endMeta ? <span className="text-sm">{row.endMeta}</span> : null}
              </span>
            ) : null}
          </>
        );
        return (
          // The test id and data-* sit on the link when the row opens something (tests read its href), else on the row.
          <li key={row.key} {...(row.href ? {} : { "data-testid": row.testId, ...row.data })}>
            {row.href ? (
              <Link
                href={row.href}
                className="active:bg-bg-subtle flex min-h-14 items-center gap-3 px-4 py-3"
                data-testid={row.testId}
                {...row.data}
              >
                {body}
                <Icon icon={IconChevronRight} className="text-subtle -me-1 shrink-0 rtl:rotate-180" />
              </Link>
            ) : (
              <div className="flex min-h-14 items-center gap-3 px-4 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The one primary action of a screen, docked at the bottom of the viewport (above the bottom nav, clear of the home
 * indicator) so it stays under the thumb; it settles at the end of the content when scrolled there.
 */
export function ActionDock({
  children,
  className,
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-surface z-sticky sticky bottom-(--dock) -mx-4 mt-auto flex flex-col gap-2 border-t px-4 pt-3 pb-[calc(0.75rem+var(--dock-pad))]",
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/** Label / value pairs: label left in muted ink, value right — money and dates in tabular numerals. */
export function Facts({
  items,
  className,
  testId,
}: {
  items: {
    key: string;
    label: React.ReactNode;
    value: React.ReactNode;
    strong?: boolean;
    testId?: string;
    valueTestId?: string;
  }[];
  className?: string;
  testId?: string;
}) {
  return (
    <dl className={cn("divide-border flex flex-col divide-y", className)} data-testid={testId}>
      {items.map((item) => (
        <div key={item.key} className="flex items-baseline justify-between gap-4 py-2.5" data-testid={item.testId}>
          <dt className={cn("shrink-0", item.strong ? "font-semibold" : "text-muted")}>{item.label}</dt>
          <dd
            className={cn("min-w-0 text-end text-pretty tabular-nums", item.strong && "font-semibold")}
            data-testid={item.valueTestId}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A document on paper (invoice, receipt, lease, notice, certificate): white sheet, hairline border, the issuer and
 * document kind on top, the number in mono, the key dates in a two-column grid, then the body. No stamp, no stripe.
 */
export function PaperDocument({
  issuer,
  kind,
  number,
  facts,
  children,
  footer,
  className,
  testId,
  labelledBy,
}: {
  issuer?: React.ReactNode;
  kind: React.ReactNode;
  number?: React.ReactNode;
  facts?: { key: string; label: React.ReactNode; value: React.ReactNode }[];
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  testId?: string;
  labelledBy?: string;
}) {
  return (
    <article
      aria-labelledby={labelledBy}
      className={cn("rounded-card border-border bg-surface shadow-card border", className)}
      data-testid={testId}
    >
      <header className="border-border flex flex-col gap-3 border-b px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {issuer ? <p className="text-muted text-sm">{issuer}</p> : null}
            <h2 id={labelledBy} className="text-lg font-semibold">
              {kind}
            </h2>
          </div>
          {number ? <p className="text-muted shrink-0 pt-0.5 font-mono text-sm tabular-nums">{number}</p> : null}
        </div>
        {facts && facts.length ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {facts.map((fact) => (
              <div key={fact.key} className="min-w-0">
                <dt className="text-muted text-xs">{fact.label}</dt>
                <dd className="text-sm tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>
      {children ? <div className="px-5 py-4">{children}</div> : null}
      {footer ? <footer className="border-border border-t px-5 py-4">{footer}</footer> : null}
    </article>
  );
}
