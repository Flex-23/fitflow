import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { memberFromAuthHeader } from "@/lib/member-app/auth";

/**
 * The member's current programme as structured data, so the app can render it
 * natively (same layout as the web/PDF: exercise beside its superset) and cache
 * it for offline. Videos are referenced by token; the app fetches a playable
 * URL from /api/app/video/[token] when the member taps play.
 *
 * Only the newest of each kind — the programme they are on now, not a history.
 */
export async function GET(req: NextRequest) {
  const m = await memberFromAuthHeader(req.headers.get("authorization"));
  if (!m) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const [training, nutrition] = await Promise.all([
    prisma.trainingCourse.findFirst({
      where: { memberId: m.id, isTemplate: false, shareToken: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { days: { orderBy: { order: "asc" }, include: { exercises: { orderBy: { order: "asc" } } } } },
    }),
    prisma.nutritionCourse.findFirst({
      where: { memberId: m.id, shareToken: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { days: { orderBy: { order: "asc" }, include: { meals: { orderBy: { order: "asc" } } } } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    training: training
      ? {
          id: training.id,
          title: training.title,
          days: training.days.map((d) => ({
            label: d.label,
            exercises: d.exercises.map((e) => ({
              name: e.name,
              reps: e.reps,
              supersetGroup: e.supersetGroup,
              videoToken: e.videoToken,
            })),
          })),
        }
      : null,
    nutrition: nutrition
      ? {
          id: nutrition.id,
          days: nutrition.days.map((d) => ({
            label: d.label,
            meals: d.meals.map((meal) => meal.text),
          })),
        }
      : null,
  });
}
