"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
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
  | { ok: true }
  | {
      ok: false;
      reason: "disabled" | "not_connected" | "not_on_whatsapp" | "no_file" | "not_found" | "failed";
      detail?: string;
    };

/**
 * Deliver a saved course to its member as a real PDF attachment.
 * The file was written to disk when the course was saved; it is re-rendered
 * here only if it went missing.
 */
export async function sendCourseToMember(
  kind: CourseKind,
  courseId: string
): Promise<SendCourseResult> {
  await requireRole("CAPTAIN");
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

  const res = await wa.sendDocument({
    to: toInternational(course.member.phone),
    data: pdf,
    filename: coursePdfFilename(kind, course.member.name),
    caption,
  });

  if (res.sent) return { ok: true };
  return { ok: false, reason: res.reason, detail: res.detail };
}
