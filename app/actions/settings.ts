"use server";

import { revalidatePath } from "next/cache";
import { requireMaster, requireSection } from "@/lib/auth/dal";
import { setSetting, COURSE_AUTHOR_NAME_KEY } from "@/lib/settings";
import { logActivity } from "@/lib/activity";
import { GATE_ENABLED_KEY } from "@/lib/gate/enabled";
import { VIDEO_RATING_ENABLED_KEY } from "@/lib/video-rating";
import type { ActionState } from "@/lib/action-state";

export async function updateSettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSection("MANAGEMENT");
  const threshold = parseInt(String(formData.get("expiringThreshold") ?? ""), 10);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 60) {
    return { error: "invalid" };
  }
  await setSetting("expiringSoonThresholdDays", String(threshold));

  // The management name printed on courses they write; trimmed and capped so a
  // stray paste cannot overflow the footer. Blank clears it.
  const author = String(formData.get("courseAuthorName") ?? "").trim().slice(0, 60);
  await setSetting(COURSE_AUTHOR_NAME_KEY, author);

  revalidatePath("/settings");
  revalidatePath("/notifications");
  revalidatePath("/active");
  return { ok: true };
}

/**
 * Turn the turnstile on or off for this gym.
 *
 * The master's decision alone, because it changes what everyone else sees:
 * with no gate there is no gate page and no card number on the registration
 * form — and a manager should not be able to hide a section of the system
 * from reception by ticking a box in settings.
 */
export async function setGateEnabled(enabled: boolean): Promise<{ ok: boolean }> {
  const user = await requireMaster();
  await setSetting(GATE_ENABLED_KEY, enabled ? "true" : "false");

  await logActivity({
    userId: user.id,
    action: "UPDATE_SETTINGS",
    details: `gate ${enabled ? "enabled" : "disabled"}`,
  });

  // Everything that shows or hides with it.
  revalidatePath("/settings");
  revalidatePath("/registration");
  revalidatePath("/gate");
  revalidatePath("/members");
  return { ok: true };
}

/**
 * Turn a member's ability to rate exercise videos on or off.
 *
 * The master's decision alone, same reasoning as the gate: it changes what
 * every member sees on the watch page. Turning it off never touches ratings
 * already collected — it only stops new ones.
 */
export async function setVideoRatingEnabled(enabled: boolean): Promise<{ ok: boolean }> {
  const user = await requireMaster();
  await setSetting(VIDEO_RATING_ENABLED_KEY, enabled ? "true" : "false");

  await logActivity({
    userId: user.id,
    action: "UPDATE_SETTINGS",
    details: `video ratings ${enabled ? "enabled" : "disabled"}`,
  });

  revalidatePath("/settings");
  return { ok: true };
}
