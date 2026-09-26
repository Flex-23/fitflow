import "server-only";
import { getSetting } from "@/lib/settings";

/**
 * Whether members may rate exercise videos from the watch page.
 *
 * On by default — unlike the gate, this is not hardware that may not exist;
 * it is a small extra a member does after watching. The master can still
 * turn it off later (a rollout that did not work out, or feedback nobody
 * wants to manage) without touching what was already collected.
 */
export const VIDEO_RATING_ENABLED_KEY = "videoRating.enabled";

export async function isVideoRatingEnabled(): Promise<boolean> {
  return (await getSetting(VIDEO_RATING_ENABLED_KEY, "true")) === "true";
}
