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

/**
 * A date as plain numbers: 2026/9/25.
 *
 * Written out rather than left to Intl, which orders the parts by locale and
 * would print the same day two ways across the app's two languages. One
 * order everywhere means a date on a screen and the same date on a printed
 * course never disagree, and it reads the same to a member as to the desk.
 *
 * Always year/month/day, left to right, even in Arabic — a date is a number,
 * and mirroring it is how 9/25 becomes 25/9.
 */
export function formatDate(date: Date | string, _locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** The same date, with the clock time after it. */
export function formatDateTime(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const time = new Intl.DateTimeFormat(intlLocale[locale], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${formatDate(d, locale)} · ${time}`;
}

/** Whole days from now until `date` (negative if in the past). */
export function daysUntil(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
