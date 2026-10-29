"use client";

import { useSyncExternalStore } from "react";

import { BackLink } from "@/features/shared/BackLink";

import { recallReturn } from "./verificationReturn";

const subscribe = () => () => undefined;

/**
 * The back link of `/rent/verification`: to the booking named in `?next=`, else to the booking remembered before the
 * provider (its return page has no query, review G L5), else to the fallback (my enquiries).
 */
export function VerificationBackLink({
  next,
  bookingLabel,
  fallbackHref,
  fallbackLabel,
}: {
  next: string | null;
  bookingLabel: string;
  fallbackHref: string;
  fallbackLabel: string;
}) {
  const remembered = useSyncExternalStore(subscribe, recallReturn, () => null);
  const booking = next ?? remembered;
  return booking ? (
    <BackLink href={booking}>{bookingLabel}</BackLink>
  ) : (
    <BackLink href={fallbackHref}>{fallbackLabel}</BackLink>
  );
}
