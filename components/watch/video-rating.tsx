"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { rateVideo } from "@/app/actions/video-rating";
import { emptyState, type ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/lib/i18n";

const NOTE_MAX = 150;

/**
 * A member's one-time rating for the video on this page: 1–5 stars, plus an
 * optional short note. Submitting once is the whole interaction — there is
 * no edit afterwards, so the form is replaced by a plain thank-you rather
 * than staying around inviting a second try.
 *
 * Not rendered at all when `videoRating.enabled` is off (see
 * `lib/video-rating.ts`) or when the member already has a rating on file —
 * both are decided on the server, so a member never sees a form that would
 * only answer "already_rated".
 */
export function VideoRating({
  token,
  alreadyRated,
  dict,
}: {
  token: string;
  alreadyRated: boolean;
  dict: Dictionary;
}) {
  const t = dict.watch;
  const [done, setDone] = useState(alreadyRated);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [note, setNote] = useState("");

  // Feedback happens inside the action itself, not in an effect, so it fires
  // exactly once per submission.
  const [, action, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const res = await rateVideo(prev, formData);
      if (res.ok) {
        toast.success(t.rateThanks);
        setDone(true);
      } else if (res.error === "already_rated") {
        setDone(true);
      } else if (res.error) {
        toast.error(dict.common.somethingWrong);
      }
      return res;
    },
    emptyState
  );

  if (done) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Star className="size-4 fill-brand text-brand" />
        {t.rateThanks}
      </p>
    );
  }

  const shown = hover || stars;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (stars < 1) {
          e.preventDefault();
          toast.error(t.ratePickStars);
        }
      }}
      className="w-full space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="stars" value={stars} />

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t.rateTitle}</p>
        <div className="flex items-center gap-1" dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={String(n)}
              aria-pressed={stars === n}
              onClick={() => setStars(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5"
            >
              <Star
                className={cn(
                  "size-6 transition-colors",
                  n <= shown ? "fill-brand text-brand" : "text-muted-foreground"
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Textarea
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
          maxLength={NOTE_MAX}
          placeholder={t.rateNotePlaceholder}
          className="min-h-16 text-sm"
        />
        <p className="text-end text-[11px] text-muted-foreground" dir="ltr">
          {t.rateNoteCount.replace("{n}", String(note.length))}
        </p>
      </div>

      <Button type="submit" variant="brand" size="sm" disabled={pending}>
        {pending ? t.rateSubmitting : t.rateSubmit}
      </Button>
    </form>
  );
}
