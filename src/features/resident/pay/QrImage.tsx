"use client";

import { useMemo } from "react";

import { cn } from "@/ui/lib/cn";

import { qrCanvas, qrModules, qrPath } from "./qr";

/**
 * The Thai QR as a picture: a PNG drawn from the API's payload (so a long press inside LINE saves a real image),
 * an inline SVG until then or where there is no canvas. Black on white whatever the theme — banking apps read
 * a dark-on-light code best — with a quiet zone.
 */
export function QrImage({ payload, label, dimmed }: { payload: string; label: string; dimmed?: boolean }) {
  const modules = useMemo(() => qrModules(payload), [payload]);
  // Client only: the sheet is loaded and rendered in the browser (never server-rendered).
  const png = useMemo(() => qrCanvas(modules)?.toDataURL("image/png") ?? null, [modules]);
  const size = modules.length;
  const className = cn(
    "mx-auto block aspect-square w-full max-w-64 rounded-lg bg-white",
    dimmed && "opacity-25 blur-[2px]",
  );
  return png ? (
    // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not a page image
    <img
      src={png}
      alt={label}
      width={256}
      height={256}
      className={className}
      data-testid="pay-qr"
      data-payload={payload}
    />
  ) : (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={className}
      data-testid="pay-qr"
      data-payload={payload}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={qrPath(modules)} fill="#000000" />
    </svg>
  );
}
