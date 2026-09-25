import type { Metadata } from "next";
import { VideoOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { getMemberSession } from "@/lib/member-session";
import { parseVideoLink } from "@/lib/video-link";
import { Brand } from "@/components/brand";
import { WatchGate } from "@/components/watch/watch-gate";
import { WatchPlayer } from "@/components/watch/watch-player";
import { BackToCourse } from "@/components/watch/back-to-course";

export const metadata: Metadata = { title: "Watch" };

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  /** "c" is the course this exercise was opened from. */
  searchParams: Promise<{ c?: string }>;
}) {
  const { token } = await params;
  const { c } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const [video, session] = await Promise.all([
    prisma.video.findUnique({
      where: { hiddenToken: token },
      select: { exerciseName: true, source: true, url: true },
    }),
    getMemberSession(),
  ]);

  // Where "back" goes. The course token comes from the link in the PDF, so
  // it is checked against a real course before it becomes a button — a
  // member should never be offered a way back to a page that 404s. Shape
  // first, so a malformed value never reaches the database or an href.
  const courseToken = c && /^[A-Za-z0-9_-]{1,64}$/.test(c) ? c : null;
  const backToCourse = courseToken
    ? ((await prisma.trainingCourse.findFirst({
        where: { shareToken: courseToken },
        select: { id: true },
      }))
        ? `/p/${courseToken}`
        : null)
    : null;

  // An open session still has to belong to a member whose subscription is
  // running right now — re-checked on every page view, not on every byte.
  let watcher: { name: string; phone: string; expiresAt: number } | null = null;
  if (session) {
    const now = new Date();
    const member = await prisma.member.findFirst({
      where: {
        id: session.memberId,
        subscriptions: {
          some: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } },
        },
      },
      select: { name: true, phone: true },
    });
    if (member) watcher = { name: member.name, phone: member.phone, expiresAt: session.expiresAt };
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-6">
      <div className="bg-grid absolute inset-0 opacity-20" />
      <div className="relative flex w-full max-w-xl flex-col items-center gap-8">
        <Brand size="lg" />
        {!video ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <VideoOff className="size-7" />
            </div>
            <p className="font-semibold">{dict.watch.notFound}</p>
            <p className="text-sm text-muted-foreground">{dict.watch.notFoundDesc}</p>
          </div>
        ) : watcher ? (
          <WatchPlayer
            token={token}
            exerciseName={video.exerciseName}
            link={video.source === "LINK" ? parseVideoLink(video.url ?? "") : null}
            watcherName={watcher.name}
            watcherPhone={watcher.phone}
            expiresAt={watcher.expiresAt}
            dict={dict}
            locale={locale}
          />
        ) : (
          <WatchGate token={token} exerciseName={video.exerciseName} dict={dict} />
        )}

        {/* The way back to the rest of the programme. Shown whether the video
            played or not: a member who lands on a missing one still wants
            their course, not the end of the road. */}
        <BackToCourse href={backToCourse} signedIn={!!watcher} dict={dict} />
      </div>
    </div>
  );
}
