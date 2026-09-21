import type { Metadata } from "next";
import Link from "next/link";
import { VideoOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import { getWatchSession } from "@/lib/watch-session";
import { Brand } from "@/components/brand";
import { WatchGate } from "@/components/watch/watch-gate";
import { WatchPlayer } from "@/components/watch/watch-player";

export const metadata: Metadata = { title: "Watch" };

export default async function WatchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const [video, session] = await Promise.all([
    prisma.video.findUnique({
      where: { hiddenToken: token },
      select: { exerciseName: true },
    }),
    getWatchSession(),
  ]);

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
            <Link href="/" className="text-sm font-medium text-brand underline">
              {dict.watch.backHome}
            </Link>
          </div>
        ) : watcher ? (
          <WatchPlayer
            token={token}
            exerciseName={video.exerciseName}
            watcherName={watcher.name}
            watcherPhone={watcher.phone}
            expiresAt={watcher.expiresAt}
            dict={dict}
            locale={locale}
          />
        ) : (
          <WatchGate token={token} exerciseName={video.exerciseName} dict={dict} />
        )}
      </div>
    </div>
  );
}
