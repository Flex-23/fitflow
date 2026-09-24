"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { nutritionCourseSchema } from "@/schemas/course";
import { twoMonthsFromNow } from "@/lib/courses";
import { sendCourseLink, type PortalLinkResult } from "@/lib/portal-delivery";

export async function searchMeals(query: string) {
  await requireRole("CAPTAIN");
  const q = query.trim();
  return prisma.mealSuggestion.findMany({
    where: q ? { text: { contains: q, mode: "insensitive" as const } } : {},
    orderBy: { usageCount: "desc" },
    take: 8,
    select: { text: true },
  });
}

export async function getMemberForNutrition(memberId: string) {
  await requireRole("CAPTAIN");
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, phone: true, age: true },
  });
  return member;
}

export async function createNutritionCourse(input: unknown): Promise<{
  ok: boolean;
  id?: string;
  shareToken?: string;
  /** What happened to the member's link, sent alongside the course. */
  link?: PortalLinkResult;
  error?: string;
}> {
  const user = await requireRole("CAPTAIN");
  const parsed = nutritionCourseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;

  const course = await prisma.nutritionCourse.create({
    data: {
      memberId: d.memberId,
      createdById: user.id,
      shareToken: nanoid(24),
      expiresAt: twoMonthsFromNow(),
      days: {
        create: d.days.map((day, i) => ({
          label: day.label ?? null,
          order: i,
          meals: {
            create: day.meals.map((text, j) => ({ order: j, text })),
          },
        })),
      },
    },
  });

  // Store meal texts so they become autocomplete suggestions next time.
  const texts = Array.from(
    new Set(
      d.days
        .flatMap((day) => day.meals)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.slice(0, 191))
    )
  );
  for (const text of texts) {
    await prisma.mealSuggestion.upsert({
      where: { text },
      update: { usageCount: { increment: 1 } },
      create: { text },
    });
  }

  await logActivity({
    userId: user.id,
    action: "CREATE_NUTRITION_COURSE",
    targetType: "NutritionCourse",
    targetId: course.id,
  });

  // The member's link goes out with the course — see createTrainingCourse.
  const link = await sendCourseLink(user.id, d.memberId);

  revalidatePath("/nutrition");
  return {
    ok: true,
    id: course.id,
    shareToken: course.shareToken ?? undefined,
    link: link ?? undefined,
  };
}
