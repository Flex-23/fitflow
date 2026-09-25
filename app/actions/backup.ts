"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity";
import {
  createBackup,
  listBackups,
  readBackup,
  restoreBackup,
  deleteBackup,
  type BackupInfo,
} from "@/lib/backup";
import type { ActionState } from "@/lib/action-state";

export async function getBackups(): Promise<BackupInfo[]> {
  await requireSection("MANAGEMENT");
  return listBackups();
}

export async function makeBackup(): Promise<ActionState & { backup?: BackupInfo }> {
  const user = await requireSection("MANAGEMENT");
  try {
    const backup = await createBackup();
    await logActivity({
      userId: user.id,
      action: "CREATE_BACKUP",
      targetType: "Backup",
      details: backup.name,
    });
    revalidatePath("/backup");
    return { ok: true, backup };
  } catch (e) {
    console.error("backup failed", e);
    return { error: "failed" };
  }
}

export async function removeBackup(name: string): Promise<ActionState> {
  await requireSection("MANAGEMENT");
  const ok = await deleteBackup(name);
  revalidatePath("/backup");
  return ok ? { ok: true } : { error: "not_found" };
}

/**
 * Overwrite the live database with a snapshot. Destructive, so beyond the
 * manager role it demands the manager's own password again — a stolen
 * session alone cannot wipe the gym.
 */
export async function restoreFromBackup(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireSection("MANAGEMENT");
  const name = String(formData.get("name") ?? "");
  const password = String(formData.get("password") ?? "");

  const me = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(password, me.hashedPassword))) {
    return { error: "wrong_password" };
  }

  const file = await readBackup(name);
  if (!file) return { error: "not_found" };

  try {
    // A safety snapshot of the current state first, so a restore can itself
    // be undone.
    await createBackup();
    const restored = await restoreBackup(file);

    // The snapshot may predate this manager's account; put it back so the
    // person who just restored is never locked out by their own action.
    await prisma.user.upsert({
      where: { id: me.id },
      update: {},
      create: { ...me, role: "MANAGER", isActive: true },
    });
    await logActivity({
      userId: user.id,
      action: "RESTORE_BACKUP",
      targetType: "Backup",
      details: `${name} (${restored.member} members, ${restored.subscription} subscriptions)`,
    });
    revalidatePath("/", "layout");
    return { ok: true, data: { members: restored.member, subscriptions: restored.subscription } };
  } catch (e) {
    console.error("restore failed", e);
    return { error: "failed" };
  }
}
