"use server";

import { revalidatePath } from "next/cache";
import { requireSection, requireUser } from "@/lib/auth/dal";
import { canAssignRole } from "@/lib/auth/rbac";
import {
  createAccountSchema,
  updateAccountSchema,
  resetPasswordSchema,
  changeOwnPasswordSchema,
} from "@/schemas/account";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/lib/action-state";

/**
 * Who may create whom.
 *
 * Holding the staff section is not enough on its own: you can only hand out
 * a role whose part of the system you hold yourself. See `assignableRoles`.
 */
export async function createAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const manager = await requireSection("STAFF");
  // getAll for the checkbox group: Object.fromEntries keeps only the last
  // value of a repeated field, which would silently drop every section but
  // one and hand the new manager far less than was ticked.
  const parsed = createAccountSchema.safeParse({
    ...Object.fromEntries(formData),
    sections: formData.getAll("sections"),
  });
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { displayName, username, password, role, canAddVideos, sections } = parsed.data;
  if (!canAssignRole(manager, role)) return { error: "forbidden" };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: "username_taken" };

  const user = await prisma.user.create({
    data: {
      displayName,
      username,
      role,
      hashedPassword: await hashPassword(password),
      // Managers always may; captains only when granted; reception never.
      canAddVideos: role === "MANAGER" ? true : role === "CAPTAIN" ? canAddVideos : false,
      // Chosen on the form, so a manager arrives with the access that was
      // agreed rather than existing for a while with none. Meaningless for
      // the other roles, whose remit comes with the job.
      sections: role === "MANAGER" ? sections : [],
      createdById: manager.id,
    },
  });
  await logActivity({
    userId: manager.id,
    action: "CREATE_USER",
    targetType: "User",
    targetId: user.id,
    details:
      role === "MANAGER"
        ? `${displayName} (${role}) • ${sections.join(", ") || "—"}`
        : `${displayName} (${role})`,
  });
  revalidatePath("/captains");
  return { ok: true };
}

/** The guards that keep the gym from locking itself out. */
async function lastActiveManagerCheck(targetId: string, becomesInactiveOrDemoted: boolean) {
  if (!becomesInactiveOrDemoted) return true;
  const others = await prisma.user.count({
    where: { role: "MANAGER", isActive: true, NOT: { id: targetId } },
  });
  return others > 0;
}

export async function updateAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const manager = await requireSection("STAFF");
  const parsed = updateAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { id, displayName, role, isActive, canAddVideos } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "not_found" };

  // The master is edited from its own screen, not from the staff roster —
  // where it does not even appear.
  if (target.role === "MASTER") return { error: "forbidden" };
  // The same rule on the way in and on the way out: you may not move an
  // account into a role you could not have created it in, and you may not
  // take over one that is already outside what you hold.
  if (!canAssignRole(manager, target.role) || !canAssignRole(manager, role)) {
    return { error: "forbidden" };
  }

  // You cannot demote or deactivate yourself, and the last active manager
  // must stay a manager.
  const self = target.id === manager.id;
  if (self && (role !== "MANAGER" || !isActive)) return { error: "self_lockout" };
  const losesManager = target.role === "MANAGER" && (role !== "MANAGER" || !isActive);
  if (!(await lastActiveManagerCheck(id, losesManager))) return { error: "last_manager" };

  await prisma.user.update({
    where: { id },
    data: {
      displayName,
      role,
      isActive,
      canAddVideos: role === "MANAGER" ? true : role === "CAPTAIN" ? canAddVideos : false,
    },
  });
  await logActivity({
    userId: manager.id,
    action: "UPDATE_USER",
    targetType: "User",
    targetId: id,
    details: `${displayName} (${role})${target.role !== role ? ` • was ${target.role}` : ""}`,
  });
  revalidatePath("/captains");
  revalidatePath("/videos");
  return { ok: true };
}

export async function resetPassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const manager = await requireSection("STAFF");
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Nobody resets the master's password from here; it changes its own.
  const target = await prisma.user.findUnique({
    where: { id: parsed.data.id },
    select: { role: true },
  });
  if (!target) return { error: "not_found" };
  if (target.role === "MASTER") return { error: "forbidden" };

  await prisma.user.update({
    where: { id: parsed.data.id },
    data: { hashedPassword: await hashPassword(parsed.data.password) },
  });
  await logActivity({
    userId: manager.id,
    action: "UPDATE_USER",
    targetType: "User",
    targetId: parsed.data.id,
    details: "password reset",
  });
  return { ok: true };
}

export async function toggleVideoPermission(id: string, canAddVideos: boolean) {
  const manager = await requireSection("STAFF");
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.role !== "CAPTAIN") return;
  await prisma.user.update({ where: { id }, data: { canAddVideos } });
  await logActivity({
    userId: manager.id,
    action: "TOGGLE_VIDEO_PERMISSION",
    targetType: "User",
    targetId: id,
    details: `${target.displayName}: ${canAddVideos ? "on" : "off"}`,
  });
  revalidatePath("/captains");
  revalidatePath("/videos");
}

/**
 * Remove an account. Its activity log rows cascade away; everything it
 * created (members, courses, payments…) is kept and simply loses the
 * "created by" link, so no gym data is ever lost with a staff member.
 */
export async function deleteAccount(id: string): Promise<ActionState> {
  const manager = await requireSection("STAFF");
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "not_found" };
  if (target.role === "MASTER") return { error: "forbidden" };
  if (target.id === manager.id) return { error: "self_lockout" };
  if (!(await lastActiveManagerCheck(id, target.role === "MANAGER"))) {
    return { error: "last_manager" };
  }

  await prisma.user.delete({ where: { id } });
  await logActivity({
    userId: manager.id,
    action: "UPDATE_USER",
    targetType: "User",
    targetId: id,
    details: `deleted ${target.displayName} (${target.role})`,
  });
  revalidatePath("/captains");
  return { ok: true };
}

/** Any signed-in user may change their own password. */
export async function changeOwnPassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = changeOwnPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { currentPassword, newPassword } = parsed.data;

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { hashedPassword: true },
  });
  if (!(await verifyPassword(currentPassword, row.hashedPassword))) {
    return { error: "wrong_password" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { hashedPassword: await hashPassword(newPassword) },
  });
  await logActivity({
    userId: user.id,
    action: "UPDATE_USER",
    targetType: "User",
    targetId: user.id,
    details: "changed own password",
  });
  return { ok: true };
}
