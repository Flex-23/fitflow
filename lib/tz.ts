/**
 * Iraq time, fixed.
 *
 * "Today", the gym day, and the day/month buckets in the money reports are all
 * wall-clock questions: they must be answered in the gym's own timezone, not
 * the server's. A hosted server runs in UTC, so reading `new Date().getHours()`
 * there would cut the day three hours early and drop takings into the wrong
 * day. Every wall-clock calculation goes through here instead.
 *
 * Iraq is UTC+3 all year (it dropped daylight saving in 2008), so a fixed
 * offset is exact — no timezone database needed. Pure and client-safe.
 */

export const IRAQ_OFFSET_MS = 3 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** The Baghdad wall-clock parts of an instant. `mo` is 1-based. */
export function iraqParts(at: Date): { y: number; mo: number; d: number; h: number; mi: number } {
  const b = new Date(at.getTime() + IRAQ_OFFSET_MS);
  return {
    y: b.getUTCFullYear(),
    mo: b.getUTCMonth() + 1,
    d: b.getUTCDate(),
    h: b.getUTCHours(),
    mi: b.getUTCMinutes(),
  };
}

/** The instant at a Baghdad wall-clock time. `mo` is 1-based; parts overflow
 *  and borrow as Date.UTC does (month 13 → next January, day 0 → last of prev). */
export function iraqInstant(
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
  ms = 0
): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms) - IRAQ_OFFSET_MS);
}

/** The Baghdad calendar date of an instant, as YYYY-MM-DD. */
export function iraqDayKey(at: Date): string {
  const { y, mo, d } = iraqParts(at);
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** The Baghdad calendar month of an instant, as YYYY-MM. */
export function iraqMonthKey(at: Date): string {
  const { y, mo } = iraqParts(at);
  return `${y}-${pad(mo)}`;
}
