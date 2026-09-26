"use server";

import { revalidatePath } from "next/cache";
import { requireMaster, requireSection } from "@/lib/auth/dal";
import { setSetting } from "@/lib/settings";
import { logActivity } from "@/lib/activity";
import { GATE_ENABLED_KEY } from "@/lib/gate/enabled";
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
