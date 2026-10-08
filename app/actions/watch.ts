"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { createMemberSession, clearMemberSession } from "@/lib/member-session";
import { canonicalPhone } from "@/lib/phone";
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
 * Members are stored with one canonical phone (lib/phone.ts), so whatever way
 * the member types it — +964…, spaces, dashes, no leading zero — it reduces
 * to the same string and is looked up exactly. No partial matching: that
 * could land on a different member who shares the last digits.
 */
async function findActiveMemberByPhone(
  phone: string
): Promise<{ id: string; name: string } | null> {
  const now = new Date();
  const canonical = canonicalPhone(phone);
  if (canonical.length < 8) return null;

  const member = await prisma.member.findUnique({
    where: { phone: canonical },
    select: { id: true, name: true },
  });
  if (!member) return null;

  // A freeze whose end has passed counts as active even before the lazy
  // FROZEN→ACTIVE sync runs, matching the door (lib/gate/decide.ts).
  const active = await prisma.subscription.findFirst({
    where: {
      memberId: member.id,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ status: "ACTIVE" }, { status: "FROZEN", freezeUntil: { lte: now } }],
    },
    select: { id: true },
  });
  return active ? member : null;
}

/**
 * Leave the member session on this device.
 *
 * A phone that is lent out, or a browser an owner once opened a member's
 * link in, otherwise keeps that member signed in for a month with nothing
 * on screen to end it. The link itself is single-use, so signing out means
 * asking the gym for another one — which is the point.
 */
export async function signOutMember() {
  await clearMemberSession();
  redirect("/login");
}
