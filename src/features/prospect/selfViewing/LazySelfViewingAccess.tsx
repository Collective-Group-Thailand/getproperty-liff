"use client";

import { Suspense, useEffect, useState } from "react";

import type { Schemas } from "@/lib/api/types";
import { lazyWarm } from "@/ui/lib/lazy";

import { AccessView, type AccessIntent } from "./AccessView";

const SelfViewingAccess = lazyWarm(() => import("./SelfViewingAccess").then((m) => m.SelfViewingAccess));

type Viewing = Schemas["LeadViewingDto"];

/**
 * The door-code panel of a confirmed self viewing, light first (D-179: the enquiry page stays ≤ 180 KB): the window,
 * its state and the actions render at once; the first tap loads the working panel (warmed on the first touch
 * anywhere) and hands it what was tapped, so showing the code, arriving, leaving or reporting a problem is one tap.
 */
export function LazySelfViewingAccess({ viewing }: { viewing: Viewing & { access: NonNullable<Viewing["access"]> } }) {
  const [intent, setIntent] = useState<AccessIntent | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (intent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [intent]);

  const light = <AccessView access={viewing.access} now={now} busy={intent} onAction={setIntent} />;
  if (!intent) return light;
  return (
    <Suspense fallback={light}>
      <SelfViewingAccess viewing={viewing} intent={intent} />
    </Suspense>
  );
}
