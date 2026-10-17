"use client";

/**
 * A bar chart of one utility's usage, this period against the previous one (L3 3.3). Hand-drawn SVG — no chart
 * library — and loaded lazily (`UsageFigure`), so pages without a chart never ship it. The API's decimal strings
 * are turned into numbers only to size the bars; every figure a resident reads is the API's string (the table).
 * Nothing is shown on hover only: the values are in the table next to the chart.
 */
export interface UsageChartRow {
  label: string;
  current: string | null;
  previous: string | null;
}

const WIDTH = 320;
const HEIGHT = 160;
const PAD_BOTTOM = 18;
const PAD_TOP = 6;

function size(value: string | null): number {
  if (value === null) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function UsageChart({
  rows,
  label,
  tone,
  firstLabel,
  lastLabel,
}: {
  rows: UsageChartRow[];
  /** The accessible description of the whole chart. */
  label: string;
  tone: "electric" | "water";
  firstLabel: string;
  lastLabel: string;
}) {
  const max = Math.max(...rows.map((r) => Math.max(size(r.current), size(r.previous))), 0) || 1;
  const slot = WIDTH / Math.max(rows.length, 1);
  const bar = Math.max(1, slot * 0.38);
  const plot = HEIGHT - PAD_BOTTOM - PAD_TOP;
  const color = tone === "electric" ? "var(--color-primary)" : "var(--color-info)";
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      className="h-40 w-full"
      preserveAspectRatio="none"
      data-testid={`usage-chart-${tone}`}
    >
      <line x1="0" x2={WIDTH} y1={HEIGHT - PAD_BOTTOM} y2={HEIGHT - PAD_BOTTOM} stroke="var(--color-border)" />
      {rows.map((row, index) => {
        const x = index * slot + slot / 2;
        const previous = (size(row.previous) / max) * plot;
        const current = (size(row.current) / max) * plot;
        return (
          <g key={index}>
            {row.previous !== null ? (
              <rect
                x={x - bar}
                y={HEIGHT - PAD_BOTTOM - previous}
                width={bar}
                height={previous}
                fill="var(--color-border-strong)"
                rx="1"
              />
            ) : null}
            <rect x={x} y={HEIGHT - PAD_BOTTOM - current} width={bar} height={current} fill={color} rx="1" />
          </g>
        );
      })}
      <text x="0" y={HEIGHT - 4} fontSize="10" fill="var(--color-muted)">
        {firstLabel}
      </text>
      <text x={WIDTH} y={HEIGHT - 4} fontSize="10" textAnchor="end" fill="var(--color-muted)">
        {lastLabel}
      </text>
    </svg>
  );
}
