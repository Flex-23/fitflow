"use server";

import { revalidatePath } from "next/cache";
import { requireMaster, requireSection } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/activity";
import { markGateDirty } from "@/lib/gate/dirty";
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
 * Overwrite the live database with a snapshot.
 *
 * The master's alone. A manager takes snapshots — that is a safety habit and
 * costs nothing — but putting one back replaces every member, payment and
 * course with an older version of itself, and undoing a whole day of the
 * gym's work is an owner's decision.
 *
 * The password is still asked for on top of that, so a screen left open is
 * not enough to wipe the gym.
 */
export async function restoreFromBackup(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireMaster();
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

    // The snapshot may predate this master's account, or hold an older
    // password for it. Either way, the master who just authenticated must
    // still sign in afterwards — with the password they just used — and stay
    // master. Clear any backup row squatting on their username first, then
    // write their current record back over whatever the restore produced.
    await prisma.user.deleteMany({ where: { username: me.username, id: { not: me.id } } });
    await prisma.user.upsert({
      where: { id: me.id },
      update: {
        username: me.username,
        displayName: me.displayName,
        hashedPassword: me.hashedPassword,
        role: me.role,
        isActive: true,
        sections: me.sections,
        canAddVideos: me.canAddVideos,
      },
      create: { ...me, isActive: true },
    });
    await logActivity({
      userId: user.id,
      action: "RESTORE_BACKUP",
      targetType: "Backup",
      details: `${name} (${restored.member} members, ${restored.subscription} subscriptions)`,
    });
    // A whole-database swap makes the panel's mirror stale by definition.
    await markGateDirty();
    revalidatePath("/", "layout");
    return { ok: true, data: { members: restored.member, subscriptions: restored.subscription } };
  } catch (e) {
    console.error("restore failed", e);
    return { error: "failed" };
  }
}
