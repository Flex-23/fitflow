import type { Role, Section } from "@prisma/client";

/**
 * Who may open what.
 *
 * Four roles, and one question asked of all of them: does this person hold
 * this section? Reception and captains hold a fixed set that comes with the
 * job. A manager holds whatever the master has given them, which is the whole
 * point of the master existing. The master holds everything, always.
 */

export const ALL_SECTIONS: Section[] = [
  "RECEPTION",
  "COACHING",
  "LIBRARY",
  "FINANCE",
  "MANAGEMENT",
  "STAFF",
];

/** Enough of a user to answer a permission question. */
export type Principal = {
  role: Role;
  sections: Section[];
  canAddVideos: boolean;
};

/**
 * The sections this person actually holds.
 *
 * A captain reaches the library only when a manager has granted it, which is
 * the older `canAddVideos` flag — kept because it is a real distinction
 * between captains, not a leftover.
 */
export function sectionsFor(user: Principal): Section[] {
  switch (user.role) {
    case "MASTER":
      return ALL_SECTIONS;
    case "MANAGER":
      return user.sections;
    case "RECEPTION":
      return ["RECEPTION"];
    case "CAPTAIN":
      return user.canAddVideos ? ["COACHING", "LIBRARY"] : ["COACHING"];
  }
}

export function hasSection(user: Principal, section: Section): boolean {
  return sectionsFor(user).includes(section);
}

/** Only the master may work on accounts and permissions at all. */
export function isMaster(role: Role): boolean {
  return role === "MASTER";
}

/**
 * Where each section begins, used to land someone somewhere they can
 * actually open.
 */
const SECTION_HOME: Record<Section, string> = {
  RECEPTION: "/registration",
  COACHING: "/training",
  LIBRARY: "/videos",
  FINANCE: "/reports",
  MANAGEMENT: "/notifications",
  STAFF: "/captains",
};

/**
 * Landing route after signing in, and what the installed app opens on.
 *
 * Each role starts where its work does. A manager starts on the day's
 * summary, unless the master has not given them the money — in which case
 * the summary would be a wall of blanks, and the first section they do hold
 * is a better place to be.
 */
export function homeFor(user: Principal): string {
  if (user.role === "MASTER") return "/master";
  if (user.role === "CAPTAIN") return "/training";
  if (user.role === "RECEPTION") return "/registration";

  if (hasSection(user, "FINANCE")) return "/summary";
  const first = ALL_SECTIONS.find((s) => hasSection(user, s));
  return first ? SECTION_HOME[first] : "/no-access";
}

/**
 * Landing route from the role alone.
 *
 * The proxy holds a session cookie, not a user row, so it cannot ask about
 * sections. It sends managers to the summary and lets the page itself move
 * anyone who cannot open it — one redirect, and never a wrong answer that
 * sticks.
 */
export function roleHome(role: Role): string {
  if (role === "MASTER") return "/master";
  if (role === "CAPTAIN") return "/training";
  return role === "MANAGER" ? "/summary" : "/registration";
}
