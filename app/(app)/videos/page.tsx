import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { roleHome } from "@/lib/auth/rbac";
import { canManageVideos } from "@/lib/videos-perms";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { VideosLibrary } from "@/components/videos/videos-library";

export const metadata: Metadata = { title: "Videos library" };

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  if (!canManageVideos(user)) redirect(roleHome(user.role));

  const { q } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const raw = await prisma.video.findMany({
    where: q ? { exerciseName: { contains: q, mode: "insensitive" as const } } : undefined,
    include: { addedBy: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const videos = raw.map((v) => ({
    id: v.id,
    exerciseName: v.exerciseName,
    hiddenToken: v.hiddenToken,
    addedByName: v.addedBy?.displayName ?? null,
    createdAt: v.createdAt.toISOString(),
    source: v.source,
    url: v.url,
  }));

  return (
    <div>
      <PageHeader title={dict.videos.title} description={dict.videos.subtitle} />
      <VideosLibrary videos={videos} dict={dict} />
    </div>
  );
}
