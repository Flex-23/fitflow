/**
 * The gym's working day, which does not start at midnight.
 *
 * A late session that ends at 01:00 belongs to the evening it started in, so
 * the day is cut at 03:00: anything logged between 03:00 today and 02:59:59
 * tomorrow counts as today. Client-safe — no server-only imports.
 */
export const GYM_DAY_START_HOUR = 3;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local YYYY-MM-DD key for a calendar date. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Which gym day a timestamp belongs to (before 03:00 is still yesterday). */
export function gymDayOf(at: Date): string {
  const d = new Date(at);
  if (d.getHours() < GYM_DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return dayKey(d);
}

/** The gym day in progress right now. */
export function currentGymDay(now: Date = new Date()): string {
  return gymDayOf(now);
}

/** 03:00 on `key` through 02:59:59.999 the next morning. */
export function gymDayRange(key: string): { from: Date; to: Date } {
  const [y, m, d] = key.split("-").map(Number);
  const from = new Date(y, (m ?? 1) - 1, d ?? 1, GYM_DAY_START_HOUR, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setMilliseconds(to.getMilliseconds() - 1);
  return { from, to };
}

/** Step a gym-day key forwards or backwards. */
export function shiftGymDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(y, (m ?? 1) - 1, (d ?? 1) + days);
  return dayKey(next);
}

/** Validate a YYYY-MM-DD string, falling back to the current gym day. */
export function safeGymDay(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : currentGymDay();
}

/** Validate a YYYY-MM string, falling back to the current month. */
export function safeMonth(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** Step a YYYY-MM key by whole months. */
export function shiftMonth(key: string, months: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1 + months, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
