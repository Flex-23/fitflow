export const locales = ["ar", "en"] as const;

export type Locale = (typeof locales)[number];

/** Arabic is the default and drives an RTL layout. */
export const defaultLocale: Locale = "ar";

export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

export const localeLabel: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
};

/** Name of the cookie that stores the user's chosen locale. */
export const LOCALE_COOKIE = "fitflow_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
