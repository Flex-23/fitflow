import "server-only";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";

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
      trainingCourses: {
        where: { isTemplate: false, shareToken: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, createdAt: true, shareToken: true },
      },
      nutritionCourses: {
        where: { shareToken: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 10,
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
 * The member's personal link, minting the token on first use.
 *
 * Not generated at registration: most members never need one, and an unused
 * credential sitting in the database is only a liability.
 */
export async function getOrCreatePortalToken(memberId: string): Promise<string | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { portalToken: true },
  });
  if (!member) return null;
  if (member.portalToken) return member.portalToken;

  const portalToken = nanoid(24);
  await prisma.member.update({ where: { id: memberId }, data: { portalToken } });
  return portalToken;
}
