import { notFound } from "next/navigation";

/**
 * The root layout lives in the `(liff)` group, so an unknown path must be matched *inside* the group
 * for `not-found.tsx` to render with the layout (fonts, theme, i18n). Routes L2–L4 add take precedence
 * over this catch-all.
 */
export default function UnknownRoute() {
  notFound();
}
