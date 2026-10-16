import type { MetadataRoute } from "next";

import { BRAND_NAME } from "@/ui/brand/config";
import { oklchToHex } from "@/ui/tokens/color";
import { THEMES } from "@/ui/tokens/semantic";

/**
 * The web app manifest (PWA-ready: installable from the browser outside LINE, `standalone` with the
 * brand mark). Colours come from the tokens so they follow the brand kit when it lands (D-100). L1
 * adds the service worker (app-shell caching only — invoices are never cached offline).
 */
export function residentManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${BRAND_NAME} — ผู้อยู่อาศัย`,
    short_name: BRAND_NAME,
    description: "บิล จ่ายเงิน แจ้งซ่อม สัญญา และประกาศของห้องคุณ",
    lang: "th",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: oklchToHex(THEMES.light.bg),
    theme_color: oklchToHex(THEMES.light.primary),
    categories: ["lifestyle", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
