import "server-only";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import type { LimitRule } from "@/lib/rate-limit";

/**
 * How long an invitation link stays usable: three minutes, the gym's choice.
 *
 * Short on purpose — a link left in a WhatsApp chat is dead long before
 * anyone else could pick it up. It is also single use: the first real
 * opening destroys it, whatever time is left.
 */
export const PORTAL_LINK_TTL_MS = 3 * 60_000;

/** Throttle on the entry point, so nobody walks tokens through it. */
export const PORTAL_RULE: LimitRule = {
  max: 10,
  windowMs: 10 * 60_000,
  lockMs: 30 * 60_000,
};

/**
 * Everything a member sees on their own page, and the link that gets them
 * there.
 *
 * The page is read-only: a member can look at their subscription and open
 * their courses, and that is all. Nothing here can change gym data.
 */

export type MemberPortal = {
  id: string;
  name: string;
  phone: string;
  gender: "MALE" | "FEMALE";
  /** Compared against the session's own number; a mismatch means revoked. */
  sessionEpoch: number;
  age: number | null;
  height: number | null;
  weight: number | null;
  measurements: { key: string; value: number }[];
  subscription: {
    planName: string;
    status: "ACTIVE" | "EXPIRED" | "FROZEN" | "CANCELLED";
    startDate: string;
    endDate: string;
    daysLeft: number;
  } | null;
  /** Queued behind the current one after an early renewal. */
  upcoming: { planName: string; startDate: string; endDate: string } | null;
  /** The current programme only — the newest of each kind, never a history. */
  courses: {
    id: string;
    kind: "training" | "nutrition";
    title: string | null;
    createdAt: string;
    shareToken: string;
  }[];
};

const FEMALE_KEYS = ["chest", "waist", "hips", "glutes", "arm"] as const;

/** The member's page data, or null when the member is gone. */
export async function getMemberPortal(memberId: string): Promise<MemberPortal | null> {
  const now = new Date();

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      subscriptions: { orderBy: { endDate: "desc" }, take: 5 },
      // Only the course the member is on right now, one of each kind. Their
      // history is the gym's record, not something to hand them: a list of
      // old programmes invites following the wrong one.
      trainingCourses: {
        where: { isTemplate: false, shareToken: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, title: true, createdAt: true, shareToken: true },
      },
      nutritionCourses: {
        where: { shareToken: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true, shareToken: true },
      },
    },
  });
  if (!member) return null;

  // The one running right now; otherwise the most recent, so an expired
  // member still sees when their subscription ended rather than a blank.
  const running =
    member.subscriptions.find(
      (s) => (s.status === "ACTIVE" || s.status === "FROZEN") && s.startDate <= now && s.endDate >= now
    ) ?? member.subscriptions[0] ?? null;

  const queued =
    member.subscriptions.find((s) => s.status === "ACTIVE" && s.startDate > now) ?? null;

  const courses: MemberPortal["courses"] = [
    ...member.trainingCourses.map((c) => ({
      id: c.id,
      kind: "training" as const,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      shareToken: c.shareToken!,
    })),
    ...member.nutritionCourses.map((c) => ({
      id: c.id,
      kind: "nutrition" as const,
      title: null,
      createdAt: c.createdAt.toISOString(),
      shareToken: c.shareToken!,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    gender: member.gender,
    sessionEpoch: member.portalSessionEpoch,
    age: member.age,
    height: member.height,
    weight: member.weight,
    measurements:
      member.gender === "FEMALE"
        ? FEMALE_KEYS.filter((k) => member[k] != null).map((k) => ({ key: k, value: member[k]! }))
        : [],
    subscription: running
      ? {
          planName: running.planName,
          status: running.status,
          startDate: running.startDate.toISOString(),
          endDate: running.endDate.toISOString(),
          daysLeft: Math.ceil((running.endDate.getTime() - now.getTime()) / 86_400_000),
        }
      : null,
    upcoming: queued
      ? {
          planName: queued.planName,
          startDate: queued.startDate.toISOString(),
          endDate: queued.endDate.toISOString(),
        }
      : null,
    courses,
  };
}

/**
 * Mint a fresh invitation token, replacing whatever came before.
 *
 * Always a new token: if an older one is still live, pressing send again
 * should kill it rather than leave two keys to the same door. Nothing is
 * generated at registration — an unused credential sitting in the database
 * is only a liability.
 */
export async function issuePortalToken(memberId: string): Promise<string | null> {
  const portalToken = nanoid(32);
  try {
    await prisma.member.update({
      where: { id: memberId },
      data: {
        portalToken,
        portalTokenExpiresAt: new Date(Date.now() + PORTAL_LINK_TTL_MS),
      },
    });
  } catch {
    // The member was deleted between the lookup and here.
    return null;
  }
  return portalToken;
}

export type PortalEntry =
  | { ok: true; memberId: string; name: string; epoch: number }
  | { ok: false };

/**
 * Trade an invitation token for the member behind it, and burn it.
 *
 * Single use is enforced by deleting the token in the same statement that
 * reads it: `updateMany` with the token in the filter only touches a row if
 * that exact token is still there, so two taps arriving together cannot both
 * succeed. An expired token is treated exactly like a wrong one.
 */
export async function consumePortalToken(token: string): Promise<PortalEntry> {
  const member = await prisma.member.findUnique({
    where: { portalToken: token },
    select: { id: true, name: true, portalTokenExpiresAt: true, portalSessionEpoch: true },
  });
  if (!member) return { ok: false };

  if (!member.portalTokenExpiresAt || member.portalTokenExpiresAt.getTime() < Date.now()) {
    // Clear it on the way out so a dead token stops occupying the index.
    await prisma.member.updateMany({
      where: { id: member.id, portalToken: token },
      data: { portalToken: null, portalTokenExpiresAt: null },
    });
    return { ok: false };
  }

  const { count } = await prisma.member.updateMany({
    where: { id: member.id, portalToken: token },
    data: {
      portalToken: null,
      portalTokenExpiresAt: null,
      portalActivatedAt: new Date(),
    },
  });
  // Someone else got there first — the same link opened twice.
  if (count === 0) return { ok: false };

  return {
    ok: true,
    memberId: member.id,
    name: member.name,
    epoch: member.portalSessionEpoch,
  };
}

/**
 * Cut off every device currently signed in as this member.
 *
 * The session cookie is self-contained, so it cannot be deleted from here —
 * instead the number it was signed with moves on, and every cookie carrying
 * the old one stops verifying on the next page load.
 */
export async function revokePortalSessions(memberId: string): Promise<boolean> {
  try {
    await prisma.member.update({
      where: { id: memberId },
      data: {
        portalSessionEpoch: { increment: 1 },
        portalToken: null,
        portalTokenExpiresAt: null,
      },
    });
    return true;
  } catch {
    return false;
  }
}
