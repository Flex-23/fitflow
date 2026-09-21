import type { Role } from "@prisma/client";

/**
 * Landing route after login. There is no dashboard: reception (and the
 * manager, who can do reception work) land on the registration form, and
 * captains land on the training builder.
 */
export function roleHome(role: Role): string {
  return role === "CAPTAIN" ? "/training" : "/registration";
}

/** The manager can access every staff area; other roles only their own. */
export function canAccess(role: Role, allowed: Role[]): boolean {
  return role === "MANAGER" || allowed.includes(role);
}
