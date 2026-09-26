/**
 * The staff pages — one list, used by the proxy and by the sign-in redirect.
 *
 * It exists because "is this a page at all?" is a different question from
 * "may this person open it", and both of them used to be answered by "not
 * public, therefore bounce to the sign-in form". A typed address that is not
 * a page was sent to sign in and then handed back to itself, so signing in
 * correctly ended on a 404.
 *
 * Client-safe and dependency-free: the proxy runs on the edge and cannot
 * pull in anything server-only.
 */
export const STAFF_PREFIXES = [
  "/registration",
  "/active",
  "/expired",
  "/deferred",
  "/members",
  "/gate",
  "/training",
  "/nutrition",
  "/videos",
  "/summary",
  "/reports",
  "/expenses",
  "/debts",
  "/plans",
  "/archive",
  "/activity",
  "/notifications",
  "/settings",
  "/backup",
  "/captains",
  "/master",
  "/no-access",
] as const;

/** True when `pathname` is this prefix, or a page underneath it. */
export function startsWithSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when `pathname` is one of the staff pages. */
export function isStaffPath(pathname: string): boolean {
  return STAFF_PREFIXES.some((p) => startsWithSegment(pathname, p));
}
