"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/** The event Chrome fires when the app is installable; not in lib.dom yet. */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "fitflow:install-dismissed";

/**
 * A one-line invitation to put FitFlow on the home screen.
 *
 * Chrome hands us an event we can turn into the real install dialog. Safari
 * has no such event, so on an iPhone we can only point at the Share button —
 * which is why the bar says two different things.
 *
 * Dismissal is remembered on the device: someone who has said no once should
 * not be asked again every time they open a page.
 */
export function InstallPrompt({ dict }: { dict: Dictionary }) {
  const t = dict.pwa;
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // Already installed: `standalone` is the display mode inside the app.
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari's own flag, which predates the media query.
      (navigator as { standalone?: boolean }).standalone === true;
    if (installed) return;

    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      // Private mode can throw on read; showing the bar is the safe default.
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires that event, so it gets the manual instructions instead.
    // Deferred by a frame rather than set here: Chrome fires the event almost
    // immediately, and an iPhone bar that appears a frame later is invisible
    // to the eye but keeps this out of the render path.
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const safari = /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    const frame = ios && safari ? requestAnimationFrame(() => setIosHint(true)) : 0;

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  if (!event && !iosHint) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do — the bar simply comes back next time.
    }
    setEvent(null);
    setIosHint(false);
  };

  const install = async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    // The event can only be used once, whichever way it went.
    setEvent(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t.installTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {event ? t.installBody : t.installIos}
          </p>
        </div>

        {event ? (
          <Button type="button" variant="brand" size="sm" onClick={install}>
            <Download className="size-4" />
            {t.install}
          </Button>
        ) : (
          <Share className="size-5 shrink-0 text-brand" />
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label={dict.common.close}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
