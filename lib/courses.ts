import "server-only";
import { prisma } from "@/lib/prisma";
import { deleteCoursePdf } from "@/lib/pdf/store";

/**
 * Member courses auto-delete after 2 months; templates are permanent.
 * The generated PDF goes with the record — otherwise the file would stay on
 * disk and its share link would keep serving the member's personal data.
 */
export async function purgeExpiredCourses() {
  const now = new Date();
  try {
    const [training, nutrition] = await Promise.all([
      prisma.trainingCourse.findMany({
        where: { isTemplate: false, expiresAt: { lt: now } },
        select: { shareToken: true },
      }),
      prisma.nutritionCourse.findMany({
        where: { expiresAt: { lt: now } },
        select: { shareToken: true },
      }),
    ]);
    const tokens = [...training, ...nutrition]
      .map((c) => c.shareToken)
      .filter((t): t is string => !!t);

    await prisma.trainingCourse.deleteMany({
      where: { isTemplate: false, expiresAt: { lt: now } },
    });
    await prisma.nutritionCourse.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    await Promise.all(tokens.map(deleteCoursePdf));
  } catch (e) {
    console.error("purgeExpiredCourses failed", e);
  }
}

/** Remove the stored PDFs of every course belonging to these members. */
export async function deleteCoursePdfsForMembers(memberIds: string[]) {
  if (memberIds.length === 0) return;
  try {
    const [training, nutrition] = await Promise.all([
      prisma.trainingCourse.findMany({
        where: { memberId: { in: memberIds } },
        select: { shareToken: true },
      }),
      prisma.nutritionCourse.findMany({
        where: { memberId: { in: memberIds } },
        select: { shareToken: true },
      }),
    ]);
    const tokens = [...training, ...nutrition]
      .map((c) => c.shareToken)
      .filter((t): t is string => !!t);
    await Promise.all(tokens.map(deleteCoursePdf));
  } catch (e) {
    console.error("deleteCoursePdfsForMembers failed", e);
  }
}

/** Two months from now (calendar-accurate). */
export function twoMonthsFromNow(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return d;
}
