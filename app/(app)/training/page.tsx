import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { purgeExpiredCourses } from "@/lib/courses";
import { canSendCourses } from "@/lib/whatsapp";
import type { TrainingCourseDTO } from "@/app/actions/courses";
import { PageHeader } from "@/components/layout/page-header";
import { TrainingBuilder } from "@/components/captain/training-builder";

export const metadata: Metadata = { title: "Training course" };

export default async function TrainingPage() {
  await requireRole("CAPTAIN");
  await purgeExpiredCourses();

  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const [raw, videos] = await Promise.all([
    prisma.trainingCourse.findMany({
      where: { isTemplate: true },
      include: {
        days: {
          orderBy: { order: "asc" },
          include: { exercises: { orderBy: { order: "asc" } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // The whole library ships with the page so exercise suggestions are
    // filtered in memory — no round trip per keystroke.
    prisma.video.findMany({
      select: { id: true, exerciseName: true, hiddenToken: true },
      orderBy: { exerciseName: "asc" },
    }),
  ]);

  const templates: TrainingCourseDTO[] = raw.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    expiresAt: null,
    shareToken: null,
    sentTo: null,
    sentAt: null,
    days: c.days.map((d) => ({
      label: d.label,
      exercises: d.exercises.map((e) => ({
        name: e.name,
        reps: e.reps,
        videoId: e.videoId,
        videoToken: e.videoToken,
        supersetGroup: e.supersetGroup,
      })),
    })),
  }));

  return (
    <div>
      <PageHeader
        title={dict.captain.trainingTitle}
        description={dict.captain.trainingSubtitle}
      />
      <TrainingBuilder
        dict={dict}
        locale={locale}
        templates={templates}
        videos={videos}
        whatsappEnabled={canSendCourses()}
      />
    </div>
  );
}
