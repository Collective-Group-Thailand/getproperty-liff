import { notFound } from "next/navigation";

/**
 * The root layout lives in the `(liff)` group, so an unknown path must be matched *inside* the group
 * for its `not-found.tsx` to render with the layouts (fonts, theme, i18n, the `(shell)` group's resident
 * shell). Routes L2–L4 add take precedence over this catch-all.
 */
export default function UnknownRoute() {
  notFound();
}
