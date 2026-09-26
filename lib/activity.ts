import "server-only";
import { prisma } from "@/lib/prisma";
import type { ActivityAction } from "@prisma/client";

/**
 * How long a deleted staff account's activity stays in the log. Deleting an
 * account only marks it; after this long it is removed for real, and its log
 * rows go with it.
 */
export const DELETED_ACCOUNT_RETENTION_DAYS = 15;

/**
 * Remove accounts deleted more than the retention period ago, with their
 * activity log (the rows cascade). Cheap and idempotent — called when the
 * log or the staff screen is opened, like the course clean-up.
 */
export async function purgeDeletedAccounts() {
  const cutoff = new Date(Date.now() - DELETED_ACCOUNT_RETENTION_DAYS * 86_400_000);
  try {
    await prisma.user.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  } catch (e) {
    console.error("purgeDeletedAccounts failed", e);
  }
}

/** Record an action taken by a staff member for the manager's activity log. */
export async function logActivity(input: {
  userId: string;
  action: ActivityAction;
  details?: string;
  targetType?: string;
  targetId?: string;
}) {
  try {
    await prisma.activityLog.create({ data: input });
  } catch (e) {
    // Never let logging failures break the primary operation.
    console.error("Failed to write activity log", e);
  }
}
