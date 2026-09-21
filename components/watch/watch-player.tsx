"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, LogOut, UserRound } from "lucide-react";
import { endWatchSession } from "@/app/actions/watch";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

/**
 * Semi-transparent label that drifts around the frame every few seconds, so
 * it cannot be cropped out of a recording and never hides one spot for long.
 */
function Watermark({ text }: { text: string }) {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPos((p) => (p + 1) % 4), 6000);
    return () => clearInterval(id);
  }, []);
  const corners = ["top-3 start-3", "top-3 end-3", "bottom-14 end-3", "bottom-14 start-3"];
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute ${corners[pos]} rounded bg-black/30 px-2 py-0.5 text-[11px] font-medium tracking-wide text-white/60 transition-all duration-700`}
      dir="ltr"
    >
      {text}
    </span>
  );
}

/** Player shown to a member with an open watch session. */
export function WatchPlayer({
  token,
  exerciseName,
  watcherName,
  watcherPhone,
  expiresAt,
  dict,
  locale,
}: {
  token: string;
  exerciseName: string;
  watcherName: string;
  watcherPhone: string;
  expiresAt: number;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.watch;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [left, setLeft] = useState(() => expiresAt - Date.now());

  // Count the session down, then drop back to the phone check on expiry.
  useEffect(() => {
    const id = setInterval(() => {
      const ms = expiresAt - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(id);
        toast.info(t.sessionExpired);
        router.refresh();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [expiresAt, router, t.sessionExpired]);

  const until = new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(expiresAt));
  const minutes = Math.max(0, Math.round(left / 60_000));

  return (
    <div className="w-full space-y-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{t.title}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{exerciseName}</h1>
      </div>

      {/*
        Best-effort anti-download: no download button, no picture-in-picture,
        no context menu, no drag, and a moving watermark with the viewer's
        name and phone so a screen recording is traceable to them.
      */}
      <div
        className="relative select-none overflow-hidden rounded-xl bg-black shadow-lg"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        <video
          controls
          autoPlay
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noremoteplayback noplaybackrate"
          onContextMenu={(e) => e.preventDefault()}
          className="w-full"
          src={`/api/videos/stream/${token}`}
        />
        <Watermark text={`${watcherName} · ${watcherPhone}`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <UserRound className="size-3.5 text-brand" />
          {t.welcomeBack}
          {watcherName && <span className="text-muted-foreground">· {watcherName}</span>}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-3.5" />
          {t.sessionUntil} {until}
          <span className="tabular-nums">({minutes} {dict.common.minutes})</span>
        </span>
        <Button
          variant="ghost"
          size="xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await endWatchSession();
              router.refresh();
            })
          }
        >
          <LogOut />
          {t.endSession}
        </Button>
      </div>
    </div>
  );
}
