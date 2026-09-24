import type { Role } from "@prisma/client";

/**
 * Landing route after login, and what the installed app opens on.
 *
 * Each role starts where its work does: the manager on the day's summary,
 * reception on the registration form, a captain on the training builder.
 */
export function roleHome(role: Role): string {
  if (role === "MANAGER") return "/summary";
  return role === "CAPTAIN" ? "/training" : "/registration";
}

/** The manager can access every staff area; other roles only their own. */
export function canAccess(role: Role, allowed: Role[]): boolean {
  return role === "MANAGER" || allowed.includes(role);
}
