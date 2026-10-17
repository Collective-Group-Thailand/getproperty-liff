"use client";

/**
 * Registers the app-shell service worker (`public/sw.js`) in production builds, after the page has loaded so it
 * never competes with the first render. Skipped where it cannot help: no `serviceWorker` support (iOS LINE's
 * WKWebView) or a development server.
 */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
