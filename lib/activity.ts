import "server-only";
import { prisma } from "@/lib/prisma";
import type { ActivityAction } from "@prisma/client";

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
