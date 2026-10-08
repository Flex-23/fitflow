"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/** The event Chrome fires when the app is installable; not in lib.dom yet. */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type RelatedApp = { platform?: string; url?: string; id?: string };
type Nav = Navigator & {
  getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
  standalone?: boolean;
};

/**
 * What we know about this device, in the order we can learn it.
 *
 * "checking" is the honest first state: the browser answers asynchronously,
 * and a button that flickers from "install" to "already installed" is worse
 * than one that waits a moment.
 */
type State = "checking" | "installed" | "ready" | "ios" | "manual";

/** How long to let Chrome fire its event before settling for instructions. */
const PROMPT_GRACE_MS = 1200;

/**
 * A standing offer to put FitFlow on the phone's home screen.
 *
 * Unlike a banner this does not appear uninvited and cannot be dismissed into
 * oblivion — it sits on the page, so someone who ignored it in March can
 * still find it in June. It checks first: a phone that already has the app is
 * told so rather than offered a second copy.
 *
 * Three ways this ends. Chrome hands us an event and we open the real install
 * dialog. Safari has no such event, so an iPhone gets the two steps to do it
 * by hand. Anything else gets the same in general terms, because claiming it
 * cannot be installed would be wrong — the browser menu usually can.
 */
export function InstallAppButton({
  dict,
  className,
}: {
  dict: Dictionary;
  className?: string;
}) {
  const t = dict.pwa;
  const [state, setState] = useState<State>("checking");
  const [showSteps, setShowSteps] = useState(false);
  const captured = useRef<InstallEvent | null>(null);

  useEffect(() => {
    let live = true;

    // Running inside the installed app: nothing to offer. Read here, acted
    // on below with everything else, so the state settles in one place.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Nav).standalone === true;

    // Chrome fires this only while the app is installable, which is itself
    // half the answer: it stays silent once the app is on the device.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      captured.current = e as InstallEvent;
      if (live) setState("ready");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const safari =
      /safari/i.test(navigator.userAgent) && !/crios|fxios|android/i.test(navigator.userAgent);
    const fallback: State = ios && safari ? "ios" : "manual";

    // The one way an ordinary tab can ask "is my own app already here?". It
    // works because each manifest lists itself as a related application.
    let timer: number | undefined;
    Promise.resolve((navigator as Nav).getInstalledRelatedApps?.())
      .then((apps) => {
        if (!live) return;
        if (standalone || apps?.some((a) => a.platform === "webapp")) {
          setState("installed");
          return;
        }
        timer = window.setTimeout(() => {
          if (live) setState((s) => (s === "checking" ? fallback : s));
        }, PROMPT_GRACE_MS);
      })
      .catch(() => {
        if (live) setState((s) => (s === "checking" ? (standalone ? "installed" : fallback) : s));
      });

    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (state === "checking") return null;

  if (state === "installed") {
    return (
      <p
        className={`flex items-center justify-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success ${className ?? ""}`}
      >
        <Check className="size-4" />
        {t.alreadyInstalled}
      </p>
    );
  }

  async function install() {
    const event = captured.current;
    if (!event) {
      setShowSteps(true);
      return;
    }
    await event.prompt();
    const { outcome } = await event.userChoice;
    // The event is single-use, whichever way it went.
    captured.current = null;
    if (outcome === "accepted") setState("installed");
    else setState("manual");
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="brand"
        className="w-full"
        onClick={state === "ready" ? install : () => setShowSteps((v) => !v)}
      >
        {state === "ready" ? <Download className="size-4" /> : <Smartphone className="size-4" />}
        {t.installTitle}
      </Button>

      {showSteps && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-border bg-card/70 p-3 text-xs text-muted-foreground">
          {state === "ios" && <Share className="mt-0.5 size-4 shrink-0 text-brand" />}
          {state === "ios" ? t.installIos : t.installManual}
        </p>
      )}
    </div>
  );
}
