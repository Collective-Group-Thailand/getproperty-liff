"use client";

import { Suspense, useEffect, useRef, useState } from "react";

import { Skeleton } from "@/ui/components/Skeleton";
import { lazyWarm } from "@/ui/lib/lazy";

/**
 * The checkbox (Radix, ~8 KB gz) for forms below the first screen: loaded when the form comes near the viewport or
 * takes focus, so pages at their 180 KB budget open without it (D-179; GL3 — `/lease/<id>`, `/profile`).
 */
export const LazyCheckbox = lazyWarm(() => import("@/ui/components/Checkbox").then((m) => m.Checkbox));

/**
 * Renders `children` once its box is within `margin` of the viewport (or something inside takes focus) — until
 * then a skeleton of `fallbackClassName`. For code that is not needed on the first screen.
 */
export function WhenNear({
  children,
  fallbackClassName = "h-12 w-full",
  margin = "200px 0px",
  testId,
}: {
  children: React.ReactNode;
  fallbackClassName?: string;
  margin?: string;
  testId?: string;
}) {
  const [near, setNear] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = box.current;
    if (near || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: margin },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [near, margin]);

  const fallback = <Skeleton className={fallbackClassName} />;
  return (
    <div ref={box} onFocusCapture={() => setNear(true)} data-testid={testId} data-near={near}>
      {near ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
}
