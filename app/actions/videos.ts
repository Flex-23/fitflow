"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { deleteStored } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { canManageVideos } from "@/lib/videos-perms";
import type { ActionState } from "@/lib/action-state";

export async function editVideo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canManageVideos(user)) return { error: "forbidden" };

  const id = String(formData.get("id") ?? "");
  const exerciseName = String(formData.get("exerciseName") ?? "").trim();
  if (!id || exerciseName.length < 1) return { error: "invalid" };

  await prisma.video.update({ where: { id }, data: { exerciseName } });
  await logActivity({
    userId: user!.id,
    action: "EDIT_VIDEO",
    targetType: "Video",
    targetId: id,
    details: exerciseName,
  });
  revalidatePath("/videos");
  return { ok: true };
}

export async function deleteVideo(id: string) {
  const user = await getCurrentUser();
  if (!canManageVideos(user)) return;

  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) return;

  await prisma.video.delete({ where: { id } });
  await deleteStored(video.storedFilename);
  await logActivity({
    userId: user!.id,
    action: "DELETE_VIDEO",
    targetType: "Video",
    targetId: id,
    details: video.exerciseName,
  });
  revalidatePath("/videos");
}

/** Autocomplete source for the course builder. */
export async function searchVideos(query: string) {
  const user = await getCurrentUser();
  if (!user) return [];
  const q = query.trim();
  return prisma.video.findMany({
    where: q ? { exerciseName: { contains: q } } : {},
    select: { id: true, exerciseName: true, hiddenToken: true },
    orderBy: { exerciseName: "asc" },
    take: 8,
  });
}
