"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { setSetting } from "@/lib/settings";
import type { ActionState } from "@/lib/action-state";

export async function updateSettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("MANAGER");
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
