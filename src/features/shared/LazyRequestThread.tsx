"use client";

import { useTranslations } from "next-intl";
import { Suspense, useEffect, useId, useRef, useState, type ComponentProps } from "react";

import { Card } from "@/ui/components/Card";
import { lazyWarm } from "@/ui/lib/lazy";

import type { RequestThread as RequestThreadImpl } from "./RequestThread";

type Props = ComponentProps<typeof RequestThreadImpl>;

const Thread = lazyWarm<Props>(() => import("./RequestThread").then((m) => m.RequestThread));

/**
 * The request thread, loaded when it comes near the screen (D-179: the request and work-order pages sit just under
 * the 180 KB initial-JS budget, and the thread is at the bottom of both). Until then — and while its chunk loads — a
 * card with the same heading holds its place, so nothing jumps; the chunk is also warmed on the first tap anywhere.
 */
export function LazyRequestThread(props: Props) {
  const t = useTranslations(props.namespace);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: "200px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  const office = props.withOffice && props.namespace === "technician.workOrders.thread";
  const placeholder = (
    <Card as="section" padding="md" aria-labelledby={`${id}-title`} data-testid="request-thread">
      <h2 id={`${id}-title`} className="font-semibold">
        {office ? t("titleOffice") : t("title")}
      </h2>
      <p className="text-muted mt-1 text-sm">{office ? t("leadOffice") : t("lead")}</p>
    </Card>
  );
  return (
    <div ref={ref}>
      {near ? (
        <Suspense fallback={placeholder}>
          <Thread {...props} />
        </Suspense>
      ) : (
        placeholder
      )}
    </div>
  );
}
