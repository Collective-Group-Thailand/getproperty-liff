// copied from getproperty-web@08ff63b until collective-shared exists (D-155) — adapted: single resident zone

/**
 * Theme selection (ADR-0003). Shared by the server stamp and the client provider, so it must stay
 * free of both `next/headers` and browser globals.
 */

/** The three palettes the tokens define. */
export const THEMES = ["light", "dark", "hc"] as const;
export type Theme = (typeof THEMES)[number];

/** What the user chose. `system` means "no `data-theme`, follow prefers-color-scheme". */
export const THEME_CHOICES = ["system", ...THEMES] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/**
 * Host-only, JS-readable on purpose: the toggle writes it without a round trip, and it carries no
 * identity. Session tokens never go in a cookie like this (CLAUDE.md).
 */
export const THEME_COOKIE = "gp_theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * getproperty-liff is one zone (ADR-0004): the resident app, which follows the phone. The technician
 * screens (R2) live in the same app and the same zone. `Zone` keeps the shape of getproperty-web's
 * API so the other theme files are copied verbatim.
 */
export const ZONES = ["resident"] as const;
export type Zone = (typeof ZONES)[number];

/** The resident app follows the phone's light/dark setting until the resident chooses. */
export const ZONE_DEFAULT_THEME = {
  resident: "system",
} as const satisfies Record<Zone, ThemeChoice>;

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The value to stamp on `<html data-theme>`: `undefined` for `system`, so the CSS media query takes over. */
export function dataThemeAttribute(choice: ThemeChoice): Theme | undefined {
  return choice === "system" ? undefined : choice;
}

/** The resident app offers system / light / dark; high contrast is the staff PWA's (design-system.md §5). */
export function themeChoicesFor(_zone: Zone): readonly ThemeChoice[] {
  return ["system", "light", "dark"] as const;
}
