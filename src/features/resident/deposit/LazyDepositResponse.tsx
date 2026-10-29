"use client";

import { Suspense, type ComponentProps } from "react";

import { Skeleton } from "@/ui/components/Skeleton";
import { lazyWarm } from "@/ui/lib/lazy";

import type { DepositResponse as Impl } from "./DepositResponse";

type Props = ComponentProps<typeof Impl>;

const DepositResponse = lazyWarm<Props>(() => import("./DepositResponse").then((m) => m.DepositResponse));

/**
 * The answer to a proposed settlement (camera, uploads, attempts) is code only a deposit with a proposal needs: loaded
 * when it renders, so a held deposit's page does not carry it (D-179; GL4 — the new routes regrouped the framework
 * chunks and `/deposit` went 0.9 KB over 180 KB).
 */
export function LazyDepositResponse(props: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <DepositResponse {...props} />
    </Suspense>
  );
}
