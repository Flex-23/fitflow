import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDictionary, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import { getCourseAuthorName } from "@/lib/settings";
import { FEMALE_MEASUREMENTS } from "@/schemas/member";
import { buildTrainingPdf, buildNutritionPdf } from "./course-pdf";

/** Strip the unit suffix from a measurement label: "Chest (cm)" → "Chest". */
const bare = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");

/**
 * The name to print at the foot of a course.
 *
 * A captain's course carries the captain's own name automatically. Anyone
 * else — a manager or the master — has no job title to borrow, so their
 * courses show the name the gym set in settings, or nothing if it is blank.
 */
async function authorName(
  createdBy: { role: Role; displayName: string } | null
): Promise<string | null> {
  if (createdBy?.role === "CAPTAIN") return createdBy.displayName;
  return (await getCourseAuthorName()) || null;
}

const CREATED_BY = { select: { role: true, displayName: true } } as const;

export function pdfResponse(bytes: Uint8Array | Buffer, filename: string) {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Render a training course, or null when the id does not exist. */
export async function renderTrainingPdf(
  id: string,
  locale: Locale,
  baseUrl: string
): Promise<Uint8Array | null> {
  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    include: {
      createdBy: CREATED_BY,
      member: {
        include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
      days: {
        orderBy: { order: "asc" },
        include: { exercises: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course) return null;

  const dict = await getDictionary(locale);
  const m = course.member;
  const sub = m?.subscriptions[0];

  return buildTrainingPdf({
    rtl: locale === "ar",
    baseUrl,
    courseToken: course.shareToken,
    authorName: await authorName(course.createdBy),
    labels: {
      exerciseColumn: dict.captain.pdfExerciseColumn,
      supersetColumn: dict.captain.pdfSupersetColumn,
      age: dict.reception.age,
      height: dict.captain.pdfHeight,
      weight: dict.captain.pdfWeight,
      start: dict.captain.pdfStart,
      end: dict.captain.pdfEnd,
      preparedBy: dict.captain.pdfPreparedBy,
    },
    member: m
      ? {
          name: m.name,
          age: m.age,
          height: m.height,
          weight: m.weight,
          measurements:
            m.gender === "FEMALE"
              ? FEMALE_MEASUREMENTS.filter((k) => m[k] != null).map(
                  (k) => `${bare(dict.reception[k])}: ${m[k]}`
                )
              : [],
          startDate: sub ? formatDate(sub.startDate, locale) : null,
          endDate: sub ? formatDate(sub.endDate, locale) : null,
        }
      : null,
    days: course.days.map((d) => ({
      label: d.label,
      exercises: d.exercises.map((e) => ({
        name: e.name,
        reps: e.reps,
        videoToken: e.videoToken,
        supersetGroup: e.supersetGroup,
      })),
    })),
  });
}

/** Render a nutrition course, or null when the id does not exist. */
export async function renderNutritionPdf(
  id: string,
  locale: Locale
): Promise<Uint8Array | null> {
  const course = await prisma.nutritionCourse.findUnique({
    where: { id },
    include: {
      createdBy: CREATED_BY,
      member: true,
      days: {
        orderBy: { order: "asc" },
        include: { meals: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course) return null;

  const dict = await getDictionary(locale);
  const m = course.member;

  return buildNutritionPdf({
    rtl: locale === "ar",
    authorName: await authorName(course.createdBy),
    labels: {
      preparedBy: dict.captain.pdfPreparedBy,
      age: dict.reception.age,
      height: dict.captain.pdfHeight,
      weight: dict.captain.pdfWeight,
    },
    member: m
      ? {
          name: m.name,
          age: m.age,
          height: m.height,
          weight: m.weight,
          measurements:
            m.gender === "FEMALE"
              ? FEMALE_MEASUREMENTS.filter((k) => m[k] != null).map(
                  (k) => `${bare(dict.reception[k])}: ${m[k]}`
                )
              : [],
        }
      : null,
    days: course.days.map((d, i) => ({
      label: d.label || `${dict.captain.day} ${i + 1}`,
      meals: d.meals.map((m) => m.text),
    })),
  });
}
