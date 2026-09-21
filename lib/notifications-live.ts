import "server-only";
import { prisma } from "@/lib/prisma";
import { getExpiringSoonThreshold } from "@/lib/settings";
import { remainingBalance } from "@/lib/money";
import { DAY_MS } from "@/lib/action-state";

/**
 * All manager notifications are computed live from subscription state, so they
 * are always accurate: expiring today, expiring soon, outstanding balances,
 * and currently frozen.
 */
export async function getLiveNotifications() {
  const threshold = await getExpiringSoonThreshold();
  const now = new Date();
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const soonEnd = new Date(now.getTime() + threshold * DAY_MS);

  const [expiringToday, expiringSoon, frozen, deferredSubs] = await Promise.all([
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

  return { expiringToday, expiringSoon, frozen, deferred, threshold };
}

export async function getNotificationCount(): Promise<number> {
  try {
    const n = await getLiveNotifications();
    return (
      n.expiringToday.length +
      n.expiringSoon.length +
      n.frozen.length +
      n.deferred.length
    );
  } catch {
    return 0;
  }
}
