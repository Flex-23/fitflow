import type { Metadata } from "next";
import { requireMaster } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { pageFrom, pageSlice, pageInfo } from "@/lib/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { RatingsManager } from "@/components/master/ratings-manager";

export const metadata: Metadata = { title: "Video ratings" };

/**
 * Every member rating, with who gave it and what they wrote — the master's
 * own reading of the feature, not the members' feed (there isn't one).
 */
export default async function RatingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireMaster();
  const { q, page } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const where = q
    ? { member: { name: { contains: q, mode: "insensitive" as const } } }
    : undefined;
  const current = pageFrom(page);

  const [total, raw, allStars] = await Promise.all([
    prisma.videoRating.count({ where }),
    prisma.videoRating.findMany({
      where,
      include: {
        member: { select: { name: true, phone: true } },
        video: { select: { exerciseName: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pageSlice(current),
    }),
    // The average and note count cover every rating, not just the visible
    // page — a search still narrows them, since they describe that result.
    prisma.videoRating.findMany({ where, select: { stars: true, note: true } }),
  ]);
  const paging = pageInfo(current, total);

  const rows = raw.map((r) => ({
    id: r.id,
    memberName: r.member.name,
    memberPhone: r.member.phone,
    exerciseName: r.video.exerciseName,
    stars: r.stars,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));

  const withNotes = allStars.filter((r) => r.note).length;
  const average = allStars.length
    ? allStars.reduce((sum, r) => sum + r.stars, 0) / allStars.length
    : 0;

  return (
    <div>
      <PageHeader title={dict.ratings.title} description={dict.ratings.subtitle} />
      <RatingsManager
        rows={rows}
        totals={{ count: allStars.length, average, withNotes }}
        paging={paging}
        dict={dict}
        locale={locale}
      />
    </div>
  );
}
