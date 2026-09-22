import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Member courses auto-delete after 2 months; templates are permanent.
 * Nothing else has to be cleaned up: the PDF is rendered per request rather
 * than stored, so a deleted course stops being downloadable immediately.
 */
export async function purgeExpiredCourses() {
  const now = new Date();
  try {
    await prisma.trainingCourse.deleteMany({
      where: { isTemplate: false, expiresAt: { lt: now } },
    });
    await prisma.nutritionCourse.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  } catch (e) {
    console.error("purgeExpiredCourses failed", e);
  }
}

/** Two months from now (calendar-accurate). */
export function twoMonthsFromNow(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return d;
}
