"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { getLocale } from "@/lib/i18n/get-locale";
import { readCoursePdf, saveCoursePdf, coursePdfFilename, type CourseKind } from "@/lib/pdf/store";
import { isWhatsAppEnabled, toInternational, buildCourseMessage } from "@/lib/whatsapp";
import * as wa from "@/lib/whatsapp/client";

export type WaStatus = Awaited<ReturnType<typeof wa.getStatus>> & { enabled: boolean };

/** Current link state, plus the QR payload while pairing. Manager only. */
export async function getWhatsAppStatus(): Promise<WaStatus> {
  await requireRole("MANAGER");
  if (!isWhatsAppEnabled()) {
    return { status: "disabled", qr: null, me: null, lastError: null, enabled: false };
  }
  // A paired number that is merely offline (fresh restart) comes back on its
  // own; the page polls while the status reads "connecting".
  if (wa.getStatus().status === "disconnected" && (await wa.hasCredentials())) void wa.connect();
  return { ...wa.getStatus(), enabled: true };
}

/** Start pairing (or reconnect). Manager only. */
export async function connectWhatsApp(): Promise<WaStatus> {
  await requireRole("MANAGER");
  if (!isWhatsAppEnabled()) {
    return { status: "disabled", qr: null, me: null, lastError: null, enabled: false };
  }
  await wa.connect();
  return { ...wa.getStatus(), enabled: true };
}

export async function disconnectWhatsApp(): Promise<WaStatus> {
  await requireRole("MANAGER");
  await wa.disconnect();
  revalidatePath("/settings");
  return { ...wa.getStatus(), enabled: isWhatsAppEnabled() };
}

export type SendCourseResult =
  | { ok: true; to: string; at: string }
  | {
      ok: false;
      reason: "disabled" | "not_connected" | "not_on_whatsapp" | "no_file" | "not_found" | "failed";
      detail?: string;
    };

/**
 * Deliver a saved course to its member as a real PDF attachment.
 * The file was written to disk when the course was saved; it is re-rendered
 * here only if it went missing. Every attempt is written to the activity log
 * with the number it went to; a success is also stamped on the course.
 */
export async function sendCourseToMember(
  kind: CourseKind,
  courseId: string
): Promise<SendCourseResult> {
  const user = await requireRole("CAPTAIN");
  if (!isWhatsAppEnabled()) return { ok: false, reason: "disabled" };

  const course =
    kind === "training"
      ? await prisma.trainingCourse.findUnique({
          where: { id: courseId },
          select: { id: true, shareToken: true, member: { select: { name: true, phone: true } } },
        })
      : await prisma.nutritionCourse.findUnique({
          where: { id: courseId },
          select: { id: true, shareToken: true, member: { select: { name: true, phone: true } } },
        });

  if (!course?.member || !course.shareToken) return { ok: false, reason: "not_found" };

  let pdf = await readCoursePdf(course.shareToken);
  if (!pdf) {
    const written = await saveCoursePdf({
      kind,
      id: course.id,
      shareToken: course.shareToken,
      locale: await getLocale(),
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || "",
    });
    if (written) pdf = await readCoursePdf(course.shareToken);
  }
  if (!pdf) return { ok: false, reason: "no_file" };

  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const caption = buildCourseMessage(
    course.member.name,
    kind,
    base ? `${base}/p/${course.shareToken}` : ""
  );

  // After a restart the paired number is offline until something wakes it.
  await wa.ensureConnected();

  const to = toInternational(course.member.phone);
  const res = await wa.sendDocument({
    to,
    data: pdf,
    filename: coursePdfFilename(kind, course.member.name),
    caption,
  });

  const kindLabel = kind === "training" ? "تدريب" : "تغذية";
  const outcome = res.sent ? "✓" : `✗ ${res.reason}${res.detail ? `: ${res.detail}` : ""}`;
  await logActivity({
    userId: user.id,
    action: "SEND_COURSE",
    targetType: kind === "training" ? "TrainingCourse" : "NutritionCourse",
    targetId: course.id,
    details: `${course.member.name} • ${kindLabel} • +${to} • ${outcome}`,
  });

  if (!res.sent) return { ok: false, reason: res.reason, detail: res.detail };

  const at = new Date();
  const stamp = { sentTo: to, sentAt: at };
  if (kind === "training") {
    await prisma.trainingCourse.update({ where: { id: course.id }, data: stamp });
  } else {
    await prisma.nutritionCourse.update({ where: { id: course.id }, data: stamp });
  }
  return { ok: true, to, at: at.toISOString() };
}
