import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { canManageVideos } from "@/lib/videos-perms";
import { prisma } from "@/lib/prisma";
import { saveUpload, UploadTooLarge } from "@/lib/storage";
import {
  extensionFor,
  isAcceptedVideoType,
  MAX_VIDEO_BYTES,
} from "@/lib/video-formats";
import { logActivity } from "@/lib/activity";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canManageVideos(user)) return new Response("Forbidden", { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const exerciseName = String(form.get("exerciseName") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "file_required" }, { status: 400 });
  }
  if (!exerciseName) {
    return Response.json({ error: "name_required" }, { status: 400 });
  }
  // Only known video containers; the browser-reported type is not trusted for
  // anything beyond this whitelist check.
  if (!isAcceptedVideoType(file.type)) {
    return Response.json({ error: "invalid_file" }, { status: 415 });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return Response.json(
      { error: "too_large", maxBytes: MAX_VIDEO_BYTES },
      { status: 413 }
    );
  }

  // Extension comes from the validated MIME type, never the uploaded name.
  const storedFilename = `${nanoid()}${extensionFor(file.type)}`;
  try {
    await saveUpload(file, storedFilename);
  } catch (e) {
    if (e instanceof UploadTooLarge) {
      return Response.json(
        { error: "too_large", maxBytes: MAX_VIDEO_BYTES },
        { status: 413 }
      );
    }
    console.error("video upload failed", e);
    return Response.json({ error: "upload_failed" }, { status: 500 });
  }

  const video = await prisma.video.create({
    data: {
      exerciseName,
      storedFilename,
      originalName: file.name.slice(0, 190),
      mimeType: file.type,
      sizeBytes: file.size,
      hiddenToken: nanoid(24),
      addedById: user.id,
    },
  });

  await logActivity({
    userId: user.id,
    action: "ADD_VIDEO",
    targetType: "Video",
    targetId: video.id,
    details: exerciseName,
  });

  revalidatePath("/videos");
  return Response.json({ ok: true, id: video.id });
}
