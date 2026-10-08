import "server-only";
import { prisma } from "@/lib/prisma";

export async function getSetting(key: string, fallback: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getExpiringSoonThreshold(): Promise<number> {
  const v = await getSetting("expiringSoonThresholdDays", "3");
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * The name printed at the foot of a course written by management. Captains'
 * courses carry the captain's own name; a manager has no single job title to
 * borrow, so the gym sets one here (or leaves it blank to print nothing).
 */
export const COURSE_AUTHOR_NAME_KEY = "course.authorName";

export async function getCourseAuthorName(): Promise<string> {
  return (await getSetting(COURSE_AUTHOR_NAME_KEY, "")).trim();
}
