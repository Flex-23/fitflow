import "server-only";
import { prisma } from "@/lib/prisma";
import { getDictionary, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import { FEMALE_MEASUREMENTS } from "@/schemas/member";
import { buildTrainingPdf, buildNutritionPdf } from "./course-pdf";

/** Strip the unit suffix from a measurement label: "Chest (cm)" → "Chest". */
const bare = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");

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
    labels: {
      programTitle: dict.captain.trainingTitle,
      reps: dict.captain.reps,
      superset: dict.captain.superset,
      phone: dict.common.phone,
      age: dict.reception.age,
      heightWeight: dict.captain.heightWeight,
      period: dict.captain.period,
      gender: dict.reception.gender,
      measurements: dict.reception.extraMeasurements,
    },
    member: m
      ? {
          name: m.name,
          phone: m.phone,
          gender: m.gender === "FEMALE" ? dict.reception.female : dict.reception.male,
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
    title: course.title,
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
      member: { select: { name: true, phone: true } },
      days: {
        orderBy: { order: "asc" },
        include: { meals: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course) return null;

  const dict = await getDictionary(locale);

  return buildNutritionPdf({
    rtl: locale === "ar",
    labels: {
      programTitle: dict.captain.nutritionTitle,
      phone: dict.common.phone,
    },
    member: course.member
      ? { name: course.member.name, phone: course.member.phone }
      : null,
    days: course.days.map((d, i) => ({
      label: d.label || `${dict.captain.day} ${i + 1}`,
      meals: d.meals.map((m) => m.text),
    })),
  });
}
