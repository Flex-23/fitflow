import "server-only";
import { prisma } from "@/lib/prisma";
import { getExpiringSoonThreshold } from "@/lib/settings";
import { remainingBalance } from "@/lib/money";
import { DAY_MS } from "@/lib/action-state";

/**
 * How long a subscription stays on the list after it runs out.
 *
 * Expiry is worth telling someone about twice: while it is coming, and once
 * it has happened. But only once it has *just* happened — after that the
 * member is on the expired page, where reception works through them, and
 * leaving them here would turn a list of things to do into a list of things
 * that are always true.
 *
 * 42 hours, so a subscription that ends on a quiet evening is still on the
 * list the morning after next, and the notice clears itself without anyone
 * dismissing it.
 */
export const EXPIRED_NOTICE_MS = 42 * 60 * 60 * 1000;

/**
 * All manager notifications are computed live from subscription state, so they
 * are always accurate: expiring today, expiring soon, just expired,
 * outstanding balances, and currently frozen.
 *
 * Nothing is stored and nothing is dismissed: every one of these is a true
 * statement about the gym right now, so they appear when they become true
 * and go when they stop being.
 */
export async function getLiveNotifications() {
  const threshold = await getExpiringSoonThreshold();
  const now = new Date();
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const soonEnd = new Date(now.getTime() + threshold * DAY_MS);
  const noticeFrom = new Date(now.getTime() - EXPIRED_NOTICE_MS);

  const [expiringToday, expiringSoon, justExpired, frozen, deferredSubs] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: "ACTIVE", endDate: { gte: now, lte: endToday } },
      include: { member: true },
      orderBy: { endDate: "asc" },
    }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE", endDate: { gt: endToday, lte: soonEnd } },
      include: { member: true },
      orderBy: { endDate: "asc" },
    }),
    // Ran out within the notice window. Status is not the test: the nightly
    // sync is what flips ACTIVE to EXPIRED, and a subscription that ended an
    // hour ago should be here before it runs.
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "EXPIRED"] }, endDate: { gte: noticeFrom, lt: now } },
      include: { member: true },
      orderBy: { endDate: "desc" },
    }),
    prisma.subscription.findMany({
      where: { status: "FROZEN" },
      include: { member: true },
      orderBy: { freezeUntil: "asc" },
    }),
    prisma.subscription.findMany({
      where: { method: "DEFERRED", status: { in: ["ACTIVE", "EXPIRED", "FROZEN"] } },
      include: { member: true, payments: true },
    }),
  ]);

  const deferred = deferredSubs
    .map((s) => ({ subscription: s, remaining: remainingBalance(s.price, s.payments) }))
    .filter((d) => d.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  return { expiringToday, expiringSoon, justExpired, frozen, deferred, threshold };
}

export async function getNotificationCount(): Promise<number> {
  try {
    const n = await getLiveNotifications();
    return (
      n.expiringToday.length +
      n.expiringSoon.length +
      n.justExpired.length +
      n.frozen.length +
      n.deferred.length
    );
  } catch {
    return 0;
  }
}
