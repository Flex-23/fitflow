"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { markGateDirty } from "@/lib/gate/dirty";
import { setSetting } from "@/lib/settings";
import { GATE_WIPE_REQUESTED_KEY } from "@/lib/gate/worker-state";
import type { ActionState } from "@/lib/action-state";

/**
 * Ask the bridge to reconcile the panel's memory right now, instead of
 * waiting for the periodic sync. The bridge does the actual work — this only
 * sets the flag it polls for (see docs/gate-hybrid-mode.md §4.3).
 *
 * Not logged to the activity log: this is an operational nudge someone might
 * click several times in a row while watching the panel catch up, not a
 * business event worth a permanent record (unlike removing a member's card,
 * below).
 */
export async function resyncGateAction(): Promise<ActionState> {
  await requireSection("MANAGEMENT");
  await markGateDirty();
  return { ok: true };
}

/**
 * Ask the bridge to delete every card from the panel's own memory, then
 * rebuild it fresh from the database. Nothing about who may enter changes —
 * the bridge keeps deciding live from FitFlow the whole time this runs —
 * this only clears out anything stale or corrupted on the panel's side. Not
 * logged, same reasoning as resyncGateAction.
 */
export async function wipeGateAction(): Promise<ActionState> {
  await requireSection("MANAGEMENT");
  await setSetting(GATE_WIPE_REQUESTED_KEY, "true");
  return { ok: true };
}

/**
 * Unassign a member's card — the same effect as clearing it from their file
 * (app/actions/members.ts → updateMember), offered here for the one screen
 * that lists card holders. The member keeps existing; they just no longer
 * qualify for the door, so the next reconcile removes them from the panel.
 */
export async function removeCardAction(formData: FormData): Promise<void> {
  const user = await requireSection("MANAGEMENT");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const member = await prisma.member.findUnique({ where: { id }, select: { name: true } });
  if (!member) return;

  await prisma.member.update({
    where: { id },
    data: { cardNumber: null, cardWiegand: null },
  });
  await logActivity({
    userId: user.id,
    action: "UPDATE_MEMBER",
    targetType: "Member",
    targetId: id,
    details: `${member.name} • card removed`,
  });
  await markGateDirty();

  revalidatePath("/gate/cards");
  revalidatePath("/members");
}
