"use server";

import { revalidatePath } from "next/cache";
import { requireSection } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { type CourseKind } from "@/lib/pdf/store";
import { isWhatsAppEnabled, canSendCourses, toInternational } from "@/lib/whatsapp";
import { getSetting } from "@/lib/settings";
import QRCode from "qrcode";
import {
  WA_HEARTBEAT_KEY,
  WA_NUMBER_KEY,
  WA_LINKED_AT_KEY,
  WA_QR_KEY,
  WA_QR_AT_KEY,
  WA_PAIR_UNTIL_KEY,
  WA_UNLINK_KEY,
  WORKER_STALE_MS,
  QR_STALE_MS,
  PAIR_WINDOW_MS,
} from "@/lib/whatsapp/worker-state";

/**
 * Sending happens on the gym computer, not here.
 *
 * A hosted serverless app cannot hold WhatsApp's socket open, so these
 * actions only write to the outbox; the worker beside the gate bridge
 * (`npm run whatsapp`) picks the row up, downloads the course PDF from its
 * share link and sends it from the gym's number.
 */

export type WaStatus = {
  /** Sending is switched on at all (WHATSAPP_ENABLED). */
  enabled: boolean;
  /** The worker reported in recently. */
  online: boolean;
  /** Paired number, digits only, or null when never linked. */
  number: string | null;
  linkedAt: string | null;
  lastSeen: string | null;
  pending: number;
  failed: number;
  /**
   * The pairing code, rendered as an image, while one is waiting to be
   * scanned. Null at every other time — including when the code on file has
   * already rotated, because showing a dead code is worse than showing none.
   */
  qrDataUrl: string | null;
  /** Milliseconds left on the open pairing window; 0 when none is open. */
  pairingLeftMs: number;
};

/** What the Settings page shows about WhatsApp delivery. Manager only. */
export async function getWhatsAppStatus(): Promise<WaStatus> {
  await requireSection("MANAGEMENT");

  const [number, linkedAt, lastSeen, qr, qrAt, pairUntil, pending, failed] = await Promise.all([
    getSetting(WA_NUMBER_KEY, ""),
    getSetting(WA_LINKED_AT_KEY, ""),
    getSetting(WA_HEARTBEAT_KEY, ""),
    getSetting(WA_QR_KEY, ""),
    getSetting(WA_QR_AT_KEY, ""),
    getSetting(WA_PAIR_UNTIL_KEY, ""),
    prisma.whatsAppOutbox.count({ where: { status: "PENDING" } }),
    prisma.whatsAppOutbox.count({ where: { status: "FAILED" } }),
  ]);

  const now = Date.now();
  const seen = lastSeen ? Date.parse(lastSeen) : NaN;
  const madeAt = qrAt ? Date.parse(qrAt) : NaN;
  const until = pairUntil ? Date.parse(pairUntil) : NaN;

  const pairingLeftMs = Number.isFinite(until) ? Math.max(0, until - now) : 0;
  // A code outlives neither its own rotation nor the window it was made in.
  const fresh =
    qr && pairingLeftMs > 0 && Number.isFinite(madeAt) && now - madeAt < QR_STALE_MS;

  // Drawn here rather than in the browser: the page needs an image, not a QR
  // library, and the payload never has to reach the client at all.
  let qrDataUrl: string | null = null;
  if (fresh) {
    qrDataUrl = await QRCode.toDataURL(qr, { width: 480, margin: 1 }).catch(() => null);
  }

  return {
    enabled: isWhatsAppEnabled(),
    online: Number.isFinite(seen) && now - seen < WORKER_STALE_MS,
    number: number || null,
    linkedAt: linkedAt || null,
    lastSeen: lastSeen || null,
    pending,
    failed,
    qrDataUrl,
    pairingLeftMs,
  };
}

/**
 * Ask the worker for a pairing code, and give it a minute to be scanned.
 *
 * Nothing is generated until this is pressed. The worker opens a socket while
 * the window is open and closes it again when it passes, so a key to the
 * gym's WhatsApp account exists only while someone is there to use it.
 */
export async function startPairing(): Promise<{ ok: boolean }> {
  await requireSection("MANAGEMENT");
  const until = new Date(Date.now() + PAIR_WINDOW_MS).toISOString();

  await prisma.$transaction([
    prisma.setting.upsert({
      where: { key: WA_PAIR_UNTIL_KEY },
      update: { value: until },
      create: { key: WA_PAIR_UNTIL_KEY, value: until },
    }),
    // Any code left from a previous window is stale; clear it so the page
    // shows "waiting" rather than one that can no longer be scanned.
    prisma.setting.upsert({
      where: { key: WA_QR_KEY },
      update: { value: "" },
      create: { key: WA_QR_KEY, value: "" },
    }),
  ]);

  return { ok: true };
}

export type QueueCourseResult =
  | { ok: true; phone: string; alreadyQueued?: boolean }
  | { ok: false; reason: "disabled" | "not_found" | "no_phone" };

/**
 * Put a saved course in the delivery queue. Returns as soon as it is queued —
 * the worker may still be offline, which the Settings page reports.
 */
export async function sendCourseToMember(
  kind: CourseKind,
  courseId: string
): Promise<QueueCourseResult> {
  const user = await requireSection("COACHING");
  // Paused, and refused here as well as hidden in the UI — a server action is
  // reachable without the button that normally calls it.
  if (!canSendCourses()) return { ok: false, reason: "disabled" };

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
  if (!course.member.phone) return { ok: false, reason: "no_phone" };

  const phone = toInternational(course.member.phone);

  // Re-queueing the same course while one is still waiting would send it
  // twice; the captain just sees it is already on its way.
  const waiting = await prisma.whatsAppOutbox.findFirst({
    where: { courseId: course.id, status: "PENDING" },
    select: { id: true },
  });
  if (waiting) return { ok: true, phone, alreadyQueued: true };

  await prisma.whatsAppOutbox.create({
    data: {
      kind,
      courseId: course.id,
      memberName: course.member.name,
      phone,
      shareToken: course.shareToken,
      requestedById: user.id,
    },
  });

  await logActivity({
    userId: user.id,
    action: "SEND_COURSE",
    targetType: kind === "training" ? "TrainingCourse" : "NutritionCourse",
    targetId: course.id,
    details: `${course.member.name} • ${kind === "training" ? "تدريب" : "تغذية"} • +${phone} • queued`,
  });

  revalidatePath("/training");
  revalidatePath("/nutrition");
  return { ok: true, phone };
}

/**
 * Change the gym's number: log the current one out and start over.
 *
 * The site cannot reach WhatsApp itself, so this only records the request;
 * the worker on the gym computer performs the logout within a poll and
 * clears the stored number. The page then shows the pairing button again.
 */
export async function unlinkWhatsAppNumber(): Promise<{ ok: boolean }> {
  await requireSection("MANAGEMENT");
  const at = new Date().toISOString();
  await prisma.setting.upsert({
    where: { key: WA_UNLINK_KEY },
    update: { value: at },
    create: { key: WA_UNLINK_KEY, value: at },
  });
  return { ok: true };
}

/** Drop a failed delivery, or queue it again. Manager only. */
export async function retryFailedSends(): Promise<{ retried: number }> {
  await requireSection("MANAGEMENT");
  const { count } = await prisma.whatsAppOutbox.updateMany({
    where: { status: "FAILED" },
    data: { status: "PENDING", attempts: 0, lastError: null },
  });
  revalidatePath("/settings");
  return { retried: count };
}

export async function clearFailedSends(): Promise<{ removed: number }> {
  await requireSection("MANAGEMENT");
  const { count } = await prisma.whatsAppOutbox.deleteMany({ where: { status: "FAILED" } });
  revalidatePath("/settings");
  return { removed: count };
}
