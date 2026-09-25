import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/**
 * The way back from one exercise to the rest of the programme.
 *
 * A member taps an exercise inside their course PDF, watches it, and then
 * has nowhere to go: the video page is a dead end reached from a document,
 * so the browser's back button is the only exit and on a phone that is not
 * obvious. The course this came from travels on the link, and when it does
 * this returns them to it.
 *
 * Without that token — an old link, or a video opened from somewhere else —
 * a signed-in member is offered their own page instead, which holds the same
 * course. Someone not signed in is offered nothing, because there is nothing
 * we can honestly send them to.
 */
export function BackToCourse({
  href,
  signedIn,
  dict,
}: {
  href: string | null;
  signedIn: boolean;
  dict: Dictionary;
}) {
  const target = href ?? (signedIn ? "/me" : null);
  if (!target) return null;

  const backToCourse = target !== "/me";

  return (
    <Button asChild variant="soft" size="lg" className="w-full max-w-sm">
      <Link href={target}>
        {/* "Back" points against the reading direction: left in English,
            right in Arabic. */}
        <ArrowLeft className="size-4 rtl:hidden" />
        <ArrowRight className="hidden size-4 rtl:block" />
        {backToCourse ? dict.watch.backToCourse : dict.watch.backToMyPage}
      </Link>
    </Button>
  );
}
