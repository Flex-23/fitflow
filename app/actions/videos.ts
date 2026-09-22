"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { createUploadUrl, deleteStored, uploadExists } from "@/lib/storage";
import {
  extensionFor,
  isAcceptedVideoType,
  MAX_VIDEO_BYTES,
} from "@/lib/video-formats";
import { logActivity } from "@/lib/activity";
import { canManageVideos } from "@/lib/videos-perms";
import type { ActionState } from "@/lib/action-state";

export type UploadTicket =
  | { ok: true; url: string; token: string; storedFilename: string }
  | { ok: false; error: "forbidden" | "invalid_file" | "too_large" | "storage_off" };

/**
 * Step 1 of an upload: check the file is allowed and hand back a signed URL
 * the browser PUTs the bytes to. The stored name is generated here — never
 * taken from the caller — and its extension comes from the validated MIME
 * type, not the uploaded filename.
 */
export async function requestVideoUpload(
  mimeType: string,
  sizeBytes: number
): Promise<UploadTicket> {
  const user = await getCurrentUser();
  if (!canManageVideos(user)) return { ok: false, error: "forbidden" };
  if (!isAcceptedVideoType(mimeType)) return { ok: false, error: "invalid_file" };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_VIDEO_BYTES) {
    return { ok: false, error: "too_large" };
  }

  const storedFilename = `${nanoid()}${extensionFor(mimeType)}`;
  const ticket = await createUploadUrl(storedFilename);
  if (!ticket) return { ok: false, error: "storage_off" };
  return { ok: true, url: ticket.url, token: ticket.token, storedFilename };
}

/**
 * Step 2: the bytes are in the bucket, so record the video. The object is
 * confirmed to exist first, so a failed or skipped upload cannot leave a row
 * pointing at nothing.
 */
export async function registerVideo(input: {
  exerciseName: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
  originalName?: string;
}): Promise<ActionState & { id?: string }> {
  const user = await getCurrentUser();
  if (!canManageVideos(user)) return { error: "forbidden" };

  const exerciseName = input.exerciseName.trim();
  if (!exerciseName) return { error: "name_required" };
  if (!isAcceptedVideoType(input.mimeType)) return { error: "invalid_file" };
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(input.storedFilename)) {
    return { error: "invalid" };
  }
  if (!(await uploadExists(input.storedFilename))) return { error: "upload_failed" };

  const video = await prisma.video.create({
    data: {
      exerciseName,
      storedFilename: input.storedFilename,
      originalName: input.originalName?.slice(0, 190) ?? null,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      hiddenToken: nanoid(24),
      addedById: user!.id,
    },
  });

  await logActivity({
    userId: user!.id,
    action: "ADD_VIDEO",
    targetType: "Video",
    targetId: video.id,
    details: exerciseName,
  });

  revalidatePath("/videos");
  return { ok: true, id: video.id };
}

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
    where: q ? { exerciseName: { contains: q, mode: "insensitive" as const } } : {},
    select: { id: true, exerciseName: true, hiddenToken: true },
    orderBy: { exerciseName: "asc" },
    take: 8,
  });
}
