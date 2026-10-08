import { iraqParts, iraqInstant, iraqDayKey, DAY_MS } from "@/lib/tz";

/**
 * The gym's working day, which does not start at midnight.
 *
 * A late session that ends at 01:00 belongs to the evening it started in, so
 * the day is cut at 03:00: anything logged between 03:00 today and 02:59:59
 * tomorrow counts as today. All of this is reckoned in Iraq time (via lib/tz),
 * so it is correct whatever timezone the server runs in.
 */
export const GYM_DAY_START_HOUR = 3;

const pad = (n: number) => String(n).padStart(2, "0");

/** Baghdad calendar date key (YYYY-MM-DD) for an instant. */
export function dayKey(d: Date): string {
  return iraqDayKey(d);
}

/** Which gym day a timestamp belongs to (before 03:00 is still yesterday). */
export function gymDayOf(at: Date): string {
  // Shift back by the day-start, then read the Baghdad date: an instant before
  // 03:00 Baghdad lands on the previous calendar day.
  return iraqDayKey(new Date(at.getTime() - GYM_DAY_START_HOUR * 60 * 60 * 1000));
}

/** The gym day in progress right now. */
export function currentGymDay(now: Date = new Date()): string {
  return gymDayOf(now);
}

/** 03:00 (Iraq) on `key` through 02:59:59.999 the next morning. */
export function gymDayRange(key: string): { from: Date; to: Date } {
  const [y, m, d] = key.split("-").map(Number);
  const from = iraqInstant(y!, m ?? 1, d ?? 1, GYM_DAY_START_HOUR, 0, 0, 0);
  const to = new Date(from.getTime() + DAY_MS - 1);
  return { from, to };
}

/** Step a gym-day key forwards or backwards. */
export function shiftGymDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  // Midday avoids any edge near the day boundary; the date is what matters.
  return iraqDayKey(iraqInstant(y!, m ?? 1, (d ?? 1) + days, 12));
}

/** Validate a YYYY-MM-DD string, falling back to the current gym day. */
export function safeGymDay(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : currentGymDay();
}

/** Validate a YYYY-MM string, falling back to the current month (Iraq). */
export function safeMonth(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  const { y, mo } = iraqParts(new Date());
  return `${y}-${pad(mo)}`;
}

/** Step a YYYY-MM key by whole months. */
export function shiftMonth(key: string, months: number): string {
  const [y, m] = key.split("-").map(Number);
  const at = iraqInstant(y!, (m ?? 1) + months, 1, 12);
  const p = iraqParts(at);
  return `${p.y}-${pad(p.mo)}`;
}
