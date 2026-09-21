import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "./session";
import { canAccess, roleHome } from "./rbac";

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  canAddVideos: boolean;
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
 * Require the user to hold one of the allowed roles (MANAGER always passes).
 * On mismatch, send the user back to their own home rather than a dead end.
 */
export async function requireRole(...allowed: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canAccess(user.role, allowed)) {
    redirect(roleHome(user.role));
  }
  return user;
}
