"use client";

import { bffJson } from "@/lib/api/browser";

/**
 * Web push (VAPID), offered after a meaningful action — the first payment (L2) — never on first open. Not
 * available inside LINE's in-app browser (LINE messages already reach the resident there) or without a VAPID key.
 * CONTRACT-REQUEST #5: `POST /v1/resident/push-subscriptions` is not in the contract yet.
 */
export function pushSupported(vapidKey: string | undefined, inLineClient: boolean): boolean {
  return (
    !!vapidKey &&
    !inLineClient &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** base64url VAPID key → the bytes `pushManager.subscribe()` wants. */
export function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(key.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function subscribeToPush(vapidKey: string): Promise<"subscribed" | "denied" | "failed"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(vapidKey),
      }));
    // CONTRACT-REQUEST #5 (docs/contract-requests.md).
    await bffJson("/v1/resident/push-subscriptions", { method: "POST", body: subscription.toJSON() });
    return "subscribed";
  } catch {
    return "failed";
  }
}
