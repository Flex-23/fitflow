"use server";

import { prisma } from "@/lib/prisma";
import { createMemberSession, clearMemberSession } from "@/lib/member-session";
import { normalizePhone } from "@/lib/whatsapp";
import {
  clientKey,
  lockedFor,
  recordFailure,
  clearFailures,
  WATCH_RULE,
} from "@/lib/rate-limit";

/**
 * Public: a member proves ownership of an active subscription with their phone
 * number. On success a 1-hour watch session cookie is issued, so every other
 * exercise link in their course PDF opens without asking again.
 */
export async function requestVideoAccess(
  token: string,
  phoneRaw: string
): Promise<{ ok: boolean; lockedMinutes?: number }> {
  const phone = phoneRaw.trim();
  if (!phone) return { ok: false };

  // This endpoint answers "is this number a paying member?", so it is throttled
  // to stop anyone walking a list of phone numbers through it.
  const key = `watch:${await clientKey()}`;
  const locked = await lockedFor(key);
  if (locked > 0) return { ok: false, lockedMinutes: Math.ceil(locked / 60_000) };

  const video = await prisma.video.findUnique({
    where: { hiddenToken: token },
    select: { id: true },
  });
  if (!video) return { ok: false };

  const member = await findActiveMemberByPhone(phone);
  if (!member) {
    const lockMs = await recordFailure(key, WATCH_RULE);
    return lockMs > 0
      ? { ok: false, lockedMinutes: Math.ceil(lockMs / 60_000) }
      : { ok: false };
  }

  await clearFailures(key);
  await createMemberSession(member.id, member.name);
  return { ok: true };
}

export async function endWatchSession() {
  await clearMemberSession();
}

/**
 * Match on the digits of the phone number so a member typing +964… or using
 * spaces/dashes still resolves to their record.
 */
async function findActiveMemberByPhone(
  phone: string
): Promise<{ id: string; name: string } | null> {
  const now = new Date();
  const digits = normalizePhone(phone);
  if (digits.length < 6) return null;

  const exact = await prisma.member.findUnique({
    where: { phone },
    select: { id: true, name: true },
  });

  const candidates = exact
    ? [exact]
    : await prisma.member.findMany({
        where: { phone: { contains: digits.slice(-9), mode: "insensitive" as const } },
        select: { id: true, name: true, phone: true },
        take: 5,
      });

  for (const c of candidates) {
    const active = await prisma.subscription.count({
      where: {
        memberId: c.id,
        status: "ACTIVE",
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
    if (active > 0) return { id: c.id, name: c.name };
  }
  return null;
}
