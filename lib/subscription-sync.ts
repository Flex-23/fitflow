import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Lazily reconcile subscription statuses. Called before listing subscriptions.
 * - Frozen subscriptions whose freeze window has ended return to ACTIVE.
 * - Active subscriptions past their (freeze-extended) end date become EXPIRED.
 */
export async function syncSubscriptions() {
  const now = new Date();
  try {
    await prisma.subscription.updateMany({
      where: { status: "FROZEN", freezeUntil: { lte: now } },
      data: { status: "ACTIVE", freezeUntil: null },
    });
    await prisma.subscription.updateMany({
      where: { status: "ACTIVE", endDate: { lt: now } },
      data: { status: "EXPIRED" },
    });
  } catch (e) {
    console.error("syncSubscriptions failed", e);
  }
}
