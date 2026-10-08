"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getMemberSession } from "@/lib/member-session";
import { isVideoRatingEnabled } from "@/lib/video-rating";
import { rateVideoSchema } from "@/schemas/video-rating";
import type { ActionState } from "@/lib/action-state";

/**
 * A member's one-time star rating (+ short note) for an exercise video,
 * given from the watch page after signing in with their phone number.
 *
 * Once per member per video, enforced twice: the client hides the form once
 * it already has a rating, and the unique index on (videoId, memberId) is
 * what actually stops a second one — a race between two tabs ends in
 * "already_rated", never two rows.
 */
export async function rateVideo(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await isVideoRatingEnabled())) return { error: "disabled" };

  const session = await getMemberSession();
  if (!session) return { error: "forbidden" };

  const parsed = rateVideoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { token, stars, note } = parsed.data;

  // Same running-subscription check every other member page makes — a
  // session outliving its subscription should not be able to leave a rating.
  const now = new Date();
  const member = await prisma.member.findFirst({
    where: {
      id: session.memberId,
      subscriptions: { some: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now } } },
    },
    select: { id: true },
  });
  if (!member) return { error: "forbidden" };

  const video = await prisma.video.findUnique({
    where: { hiddenToken: token },
    select: { id: true },
  });
  if (!video) return { error: "not_found" };

  try {
    await prisma.videoRating.create({
      data: { videoId: video.id, memberId: member.id, stars, note },
    });
  } catch {
    // Unique constraint on (videoId, memberId) — already rated.
    return { error: "already_rated" };
  }

  revalidatePath(`/watch/${token}`);
  return { ok: true };
}
