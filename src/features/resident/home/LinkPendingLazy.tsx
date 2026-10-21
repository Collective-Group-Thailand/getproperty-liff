"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const Watch = lazy(() => import("./LinkPendingWatch").then((module) => ({ default: module.LinkPendingWatch })));

/**
 * `LinkPendingWatch` on demand (D-179): home imports this, so a resident with nothing pending — almost everyone —
 * never downloads the watcher. Until it has loaded, the server-rendered card is shown as it is (its "check again" is
 * a plain reload).
 */
export function LinkPendingLazy(props: ComponentProps<typeof Watch>) {
  return (
    <Suspense fallback={props.children}>
      <Watch {...props} />
    </Suspense>
  );
}
