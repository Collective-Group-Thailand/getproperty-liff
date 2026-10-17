"use client";

import { browserApi, unwrap } from "@/lib/api/browser";

/**
 * Web push (VAPID), offered after a meaningful action — the first payment (L2) — never on first open. Not
 * available inside LINE's in-app browser (LINE messages already reach the resident there) or without a VAPID key.
 * The subscription goes to `POST /v1/resident/push-subscriptions` (re-registering an endpoint updates it).
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
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return "failed";
    unwrap(
      await browserApi.POST("/v1/resident/push-subscriptions", {
        body: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          ...(json.expirationTime ? { expiresAt: new Date(json.expirationTime).toISOString() } : {}),
        },
      }),
    );
    return "subscribed";
  } catch {
    return "failed";
  }
}
