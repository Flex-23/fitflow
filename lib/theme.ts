export const themes = ["dark", "light"] as const;
export type Theme = (typeof themes)[number];

/** Dark is the house look; the light palette is in globals.css for those who prefer it. */
export const defaultTheme: Theme = "dark";

export const THEME_COOKIE = "fitflow_theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}
