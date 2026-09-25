"use server";

import { revalidatePath } from "next/cache";
import type { Section } from "@prisma/client";
import { requireMaster } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity";
import { ALL_SECTIONS } from "@/lib/auth/rbac";
import { masterCredentialsSchema } from "@/schemas/account";
import type { ActionState } from "@/lib/action-state";

/**
 * What only the master may do.
 *
 * Deciding what each manager can open, and changing its own name and
 * password. Everything here calls `requireMaster` first: these are server
 * actions, reachable without the page that normally calls them.
 */

function clean(sections: string[]): Section[] {
  const allowed = new Set<string>(ALL_SECTIONS);
  return sections.filter((s): s is Section => allowed.has(s));
}

/** Replace a manager's sections with exactly this set. */
export async function setManagerSections(
  managerId: string,
  sections: string[]
): Promise<{ ok: boolean; reason?: "not_found" | "not_a_manager" }> {
  const master = await requireMaster();

  const target = await prisma.user.findUnique({
    where: { id: managerId },
    select: { id: true, role: true, displayName: true },
  });
  if (!target) return { ok: false, reason: "not_found" };
  // Sections mean nothing for the other roles, and a master's own access is
  // not something to edit away by accident.
  if (target.role !== "MANAGER") return { ok: false, reason: "not_a_manager" };

  const next = clean(sections);
  await prisma.user.update({ where: { id: managerId }, data: { sections: next } });

  await logActivity({
    userId: master.id,
    action: "SET_PERMISSIONS",
    targetType: "User",
    targetId: managerId,
    details: `${target.displayName} • ${next.length ? next.join(", ") : "—"}`,
  });

  revalidatePath("/master");
  return { ok: true };
}

/**
 * Change the master's own username and password.
 *
 * The current password is required even though the session already proves
 * who this is: a screen left open should not be enough to take the account
 * over. Changing the username is allowed for the same reason the address is
 * a secret — the owner should be able to move both.
 */
export async function updateMasterCredentials(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const master = await requireMaster();
  const parsed = masterCredentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { username, currentPassword, newPassword } = parsed.data;

  const row = await prisma.user.findUnique({
    where: { id: master.id },
    select: { hashedPassword: true },
  });
  if (!row || !(await verifyPassword(currentPassword, row.hashedPassword))) {
    return { error: "wrong_password" };
  }

  if (username !== master.username) {
    const taken = await prisma.user.findUnique({ where: { username } });
    if (taken) return { error: "username_taken" };
  }

  await prisma.user.update({
    where: { id: master.id },
    data: {
      username,
      // An unchanged password field leaves the password alone.
      ...(newPassword ? { hashedPassword: await hashPassword(newPassword) } : {}),
    },
  });

  await logActivity({
    userId: master.id,
    action: "UPDATE_USER",
    targetType: "User",
    targetId: master.id,
    details: newPassword ? "master credentials" : "master username",
  });

  revalidatePath("/master");
  return { ok: true };
}
