"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Star, Loader2 } from "lucide-react";
import { setVideoRatingEnabled } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n";

/**
 * Whether members may rate exercise videos from the watch page.
 *
 * On by default, unlike the gate — this needs no hardware, so there is
 * nothing to wait for before turning it on. The switch exists for later:
 * a rollout that did not work out, or feedback nobody has time to read.
 * Turning it off never touches a rating already given.
 */
export function VideoRatingToggle({
  enabled: initial,
  dict,
}: {
  enabled: boolean;
  dict: Dictionary;
}) {
  const t = dict.manager;
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const next = !enabled;
      const res = await setVideoRatingEnabled(next);
      if (!res.ok) {
        toast.error(dict.common.somethingWrong);
        return;
      }
      setEnabled(next);
      toast.success(next ? t.videoRatingTurnedOn : t.videoRatingTurnedOff);
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <Star className="mt-0.5 size-5 shrink-0 text-brand" />
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            {t.videoRatingTitle}
            <Badge variant={enabled ? "success" : "muted"}>
              {enabled ? t.videoRatingOn : t.videoRatingOff}
            </Badge>
          </p>
          <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
            {t.videoRatingToggleHelp}
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant={enabled ? "soft-destructive" : "brand"}
        size="sm"
        onClick={toggle}
        disabled={pending}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {enabled ? t.videoRatingTurnOff : t.videoRatingTurnOn}
      </Button>
    </div>
  );
}
