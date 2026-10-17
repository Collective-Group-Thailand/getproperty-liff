"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";

import { Button } from "@/ui/components/Button";
import { Skeleton } from "@/ui/components/Skeleton";

import type { UsageChartRow } from "./UsageChart";

// The chart is its own chunk, loaded after the page (D-179 budget); the table below never waits for it.
const UsageChart = dynamic(() => import("./UsageChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
});

export interface UsageFigureLabels {
  chart: string;
  current: string;
  previous: string;
  showTable: string;
  hideTable: string;
  period: string;
  caption: string;
}

/**
 * One utility's chart with its data-table fallback (every chart has one, L3 3.3): the table holds the same values
 * as the API's strings, already formatted, and is one tap away; the legend names the two series in words, not
 * colour alone.
 */
export function UsageFigure({
  rows,
  table,
  tone,
  labels,
  firstLabel,
  lastLabel,
}: {
  rows: UsageChartRow[];
  /** The rows as displayed (formatted on the server). */
  table: { label: string; current: string; previous: string }[];
  tone: "electric" | "water";
  labels: UsageFigureLabels;
  firstLabel: string;
  lastLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const tableId = useId();
  return (
    <figure className="flex flex-col gap-2" data-testid={`usage-figure-${tone}`}>
      <UsageChart rows={rows} label={labels.chart} tone={tone} firstLabel={firstLabel} lastLabel={lastLabel} />
      <figcaption className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className={`inline-block size-3 rounded-sm ${tone === "electric" ? "bg-primary" : "bg-info"}`}
          />
          {labels.current}
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="bg-border-strong inline-block size-3 rounded-sm" />
          {labels.previous}
        </span>
      </figcaption>
      <Button
        variant="ghost"
        size="lg"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((value) => !value)}
        data-testid={`usage-table-toggle-${tone}`}
      >
        {open ? labels.hideTable : labels.showTable}
      </Button>
      <div id={tableId} hidden={!open} className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm" data-testid={`usage-table-${tone}`}>
          <caption className="sr-only">{labels.caption}</caption>
          <thead>
            <tr className="text-muted text-left">
              <th scope="col" className="py-1 font-medium">
                {labels.period}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {labels.current}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {labels.previous}
              </th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.label} className="border-border border-t">
                <th scope="row" className="py-1 text-left font-normal">
                  {row.label}
                </th>
                <td className="py-1 text-right tabular-nums">{row.current}</td>
                <td className="py-1 text-right tabular-nums">{row.previous}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
