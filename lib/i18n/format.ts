import type { Locale } from "./config";

// Iraqi Arabic locale. `nu-latn` keeps Western digits (0-9) in Arabic mode —
// amounts like 25,000 stay readable for staff and match printed receipts.
const intlLocale: Record<Locale, string> = {
  ar: "ar-IQ-u-nu-latn",
  en: "en-US",
};

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value);
}

/** Money as a localized number followed by the currency label (IQD). */
export function formatMoney(
  value: number,
  locale: Locale,
  currencyLabel: string
): string {
  const n = new Intl.NumberFormat(intlLocale[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${n} ${currencyLabel}`;
}

export function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Whole days from now until `date` (negative if in the past). */
export function daysUntil(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
