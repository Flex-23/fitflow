/**
 * One way to write a member's phone number.
 *
 * The same number reaches the desk as 07701234567, 7701234567, +964 770 123
 * 4567 or 009647701234567. Stored as typed, those were four different
 * members to the database — so one person could be registered twice, and a
 * lookup by phone could miss them. Everything is reduced to the local form
 * with its leading zero: 07701234567.
 *
 * Client-safe, so the forms can show the same result the server will store.
 */
export const COUNTRY_CODE = "964";

export function canonicalPhone(raw: string, cc: string = COUNTRY_CODE): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // The country code only counts as one when a full number follows it;
  // otherwise a short local number that happens to start with 964 would lose
  // its first digits.
  if (d.startsWith(cc) && d.length - cc.length >= 9) d = d.slice(cc.length);
  d = d.replace(/^0+/, "");
  return d ? `0${d}` : "";
}

/**
 * What to look for in stored phones when staff type all or part of a number
 * into a search box: the digits after the country code and leading zero, so
 * "+964 770", "00964770" and "0770" all find 0770…. Null when the query is
 * not a number worth searching by.
 */
export function phoneSearchTerm(q: string, cc: string = COUNTRY_CODE): string | null {
  let d = q.replace(/\D/g, "");
  if (d.length < 3) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith(cc)) d = d.slice(cc.length);
  d = d.replace(/^0+/, "");
  return d || null;
}
