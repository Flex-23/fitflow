"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { trainingCourseSchema } from "@/schemas/course";
import { purgeExpiredCourses, twoMonthsFromNow } from "@/lib/courses";
import { saveCoursePdf } from "@/lib/pdf/store";
import { getLocale } from "@/lib/i18n/get-locale";

export async function searchMembers(query: string) {
  await requireRole("CAPTAIN");
  const q = query.trim();
  if (!q) return [];
  return prisma.member.findMany({
    where: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
    select: { id: true, name: true, phone: true },
    take: 8,
    orderBy: { name: "asc" },
  });
}

export type TrainingCourseDTO = {
  id: string;
  title: string | null;
  createdAt: string;
  expiresAt: string | null;
  /** Public link token; null for templates. */
  shareToken: string | null;
  days: {
    label: string;
    exercises: {
      name: string;
      reps: string;
      videoId: string | null;
      videoToken: string | null;
      supersetGroup: number | null;
    }[];
  }[];
};

/** Everything the builder shows about the selected member. */
export type MemberTrainingProfile = {
  id: string;
  name: string;
  phone: string;
  gender: "MALE" | "FEMALE";
  age: number | null;
  height: number | null;
  weight: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  glutes: number | null;
  arm: number | null;
  subscription: {
    planName: string;
    status: "ACTIVE" | "EXPIRED" | "FROZEN" | "CANCELLED";
    startDate: string;
    endDate: string;
  } | null;
};

const courseInclude = {
  days: {
    orderBy: { order: "asc" as const },
    include: { exercises: { orderBy: { order: "asc" as const } } },
  },
};

function serializeCourse(course: {
  id: string;
  title: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  shareToken: string | null;
  days: {
    label: string;
    exercises: {
      name: string;
      reps: string;
      videoId: string | null;
      videoToken: string | null;
      supersetGroup: number | null;
    }[];
  }[];
}): TrainingCourseDTO {
  return {
    id: course.id,
    title: course.title,
    createdAt: course.createdAt.toISOString(),
    expiresAt: course.expiresAt?.toISOString() ?? null,
    shareToken: course.shareToken,
    days: course.days.map((d) => ({
      label: d.label,
      exercises: d.exercises.map((e) => ({
        name: e.name,
        reps: e.reps,
        videoId: e.videoId,
        videoToken: e.videoToken,
        supersetGroup: e.supersetGroup,
      })),
    })),
  };
}

/** Profile only (no course history) — enough for the nutrition builder. */
export async function getMemberProfile(memberId: string): Promise<MemberTrainingProfile | null> {
  await requireRole("CAPTAIN");
  const now = new Date();
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  if (!member) return null;
  return toProfile(member, now);
}

type MemberWithSubs = Prisma.MemberGetPayload<{ include: { subscriptions: true } }>;

function toProfile(member: MemberWithSubs, now: Date): MemberTrainingProfile {
  // Prefer the subscription that is running right now; otherwise the latest.
  const sub =
    member.subscriptions.find(
      (s) =>
        (s.status === "ACTIVE" || s.status === "FROZEN") &&
        s.startDate <= now &&
        s.endDate > now
    ) ?? member.subscriptions[0];

  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    gender: member.gender,
    age: member.age,
    height: member.height,
    weight: member.weight,
    chest: member.chest,
    waist: member.waist,
    hips: member.hips,
    glutes: member.glutes,
    arm: member.arm,
    subscription: sub
      ? {
          planName: sub.planName,
          status: sub.status,
          startDate: sub.startDate.toISOString(),
          endDate: sub.endDate.toISOString(),
        }
      : null,
  };
}

/** Member profile + their previous (non-template) courses for the builder. */
export async function getMemberTraining(
  memberId: string
): Promise<{ member: MemberTrainingProfile; courses: TrainingCourseDTO[] } | null> {
  await requireRole("CAPTAIN");
  await purgeExpiredCourses();

  const now = new Date();
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  if (!member) return null;

  const courses = await prisma.trainingCourse.findMany({
    where: { memberId, isTemplate: false },
    include: courseInclude,
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return { member: toProfile(member, now), courses: courses.map(serializeCourse) };
}

export async function createTrainingCourse(
  input: unknown
): Promise<{ ok: boolean; id?: string; shareToken?: string; error?: string }> {
  const user = await requireRole("CAPTAIN");
  const parsed = trainingCourseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;

  if (!d.isTemplate && !d.memberId) return { ok: false, error: "member_required" };

  const course = await prisma.trainingCourse.create({
    data: {
      memberId: d.isTemplate ? null : d.memberId!,
      title: d.title ?? null,
      isTemplate: d.isTemplate,
      createdById: user.id,
      // Templates are never shared with a member.
      shareToken: d.isTemplate ? null : nanoid(24),
      expiresAt: d.isTemplate ? null : twoMonthsFromNow(),
      days: {
        create: d.days.map((day, i) => ({
          label: day.label,
          order: i,
          exercises: {
            create: day.exercises.map((e, j) => ({
              name: e.name,
              reps: e.reps,
              order: j,
              videoId: e.videoId ?? null,
              videoToken: e.videoToken ?? null,
              supersetGroup: e.supersetGroup ?? null,
            })),
          },
        })),
      },
    },
  });

  await logActivity({
    userId: user.id,
    action: d.isTemplate ? "SAVE_TEMPLATE" : "CREATE_TRAINING_COURSE",
    targetType: "TrainingCourse",
    targetId: course.id,
    details: d.title ?? undefined,
  });

  // Write the PDF to disk straight away: it is what gets attached to the
  // member's WhatsApp message and what the share link serves.
  if (course.shareToken) {
    await saveCoursePdf({
      kind: "training",
      id: course.id,
      shareToken: course.shareToken,
      locale: await getLocale(),
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || "",
    }).catch((e) => console.error("saveCoursePdf failed", e));
  }

  revalidatePath("/training");
  return { ok: true, id: course.id, shareToken: course.shareToken ?? undefined };
}

/** Replace a template's title and days in place (keeps its id). */
export async function updateTemplate(
  id: string,
  input: unknown
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("CAPTAIN");
  const parsed = trainingCourseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;

  const existing = await prisma.trainingCourse.findFirst({
    where: { id, isTemplate: true },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "not_found" };

  await prisma.$transaction([
    // Days cascade to exercises, so wiping days resets the whole body.
    prisma.courseDay.deleteMany({ where: { trainingCourseId: id } }),
    prisma.trainingCourse.update({
      where: { id },
      data: {
        title: d.title ?? null,
        days: {
          create: d.days.map((day, i) => ({
            label: day.label,
            order: i,
            exercises: {
              create: day.exercises.map((e, j) => ({
                name: e.name,
                reps: e.reps,
                order: j,
                videoId: e.videoId ?? null,
                videoToken: e.videoToken ?? null,
                supersetGroup: e.supersetGroup ?? null,
              })),
            },
          })),
        },
      },
    }),
  ]);

  await logActivity({
    userId: user.id,
    action: "UPDATE_TEMPLATE",
    targetType: "TrainingCourse",
    targetId: id,
    details: d.title ?? undefined,
  });

  revalidatePath("/training");
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  const user = await requireRole("CAPTAIN");
  const tpl = await prisma.trainingCourse.findFirst({
    where: { id, isTemplate: true },
    select: { title: true },
  });
  if (!tpl) return { ok: false };

  await prisma.trainingCourse.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "DELETE_TEMPLATE",
    targetType: "TrainingCourse",
    targetId: id,
    details: tpl.title ?? undefined,
  });
  revalidatePath("/training");
  return { ok: true };
}
