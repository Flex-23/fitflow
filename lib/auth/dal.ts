import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role, Section } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "./session";
import { hasSection, homeFor, isMaster } from "./rbac";

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  canAddVideos: boolean;
  sections: Section[];
};

/**
 * Secure session check: reads the cookie, then validates the user still exists
 * and is active against the database. Memoized per render pass.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      canAddVideos: true,
      sections: true,
    },
  });

  if (!user || !user.isActive) return null;
  return user;
});

/** Require any authenticated staff user, or redirect to login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    // A cookie that verifies but points at a missing/disabled user must be
    // cleared, otherwise the proxy (cookie-only check) and this DB check
    // redirect each other in a loop. The proxy drops the cookie when it sees
    // `stale`, which keeps logout off a GET endpoint anyone could trigger.
    const session = await getSession();
    redirect(session ? "/login?stale=1" : "/login");
  }
  return user;
}

/**
 * Require a section of the system.
 *
 * This is the guard every page uses, because "may this person open this" is a
 * question about sections, not about job titles: two managers can hold
 * different halves of the system, and the master decides which.
 *
 * On a refusal the user goes to their own home rather than a dead end.
 */
export async function requireSection(section: Section): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasSection(user, section)) redirect(homeFor(user));
  return user;
}

/**
 * Require any one of several sections.
 *
 * For the handful of actions two different people reach from two different
 * screens — sending a member their link is done at the desk and from the
 * course builder alike.
 */
export async function requireAnySection(...sections: Section[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!sections.some((s) => hasSection(user, s))) redirect(homeFor(user));
  return user;
}

/**
 * Require one of these roles outright.
 *
 * For the few places where the job title really is the question — the master's
 * own screens, and guards that exist to stop a captain reaching a manager's
 * action. Prefer `requireSection` for pages.
 */
export async function requireRole(...allowed: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isMaster(user.role) && !allowed.includes(user.role)) redirect(homeFor(user));
  return user;
}

/** The master's own screens. Everyone else is sent home. */
export async function requireMaster(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isMaster(user.role)) redirect(homeFor(user));
  return user;
}
