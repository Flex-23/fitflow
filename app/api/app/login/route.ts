import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalPhone } from "@/lib/phone";
import {
  hasActiveSubscription,
  tokenForBoundDevice,
  setMemberOtp,
  generateOtp,
} from "@/lib/member-app/auth";
import { sendOtp } from "@/lib/member-app/otp-send";
import { clientKey, lockedFor, recordFailure, type LimitRule } from "@/lib/rate-limit";

/**
 * Member app sign-in, step 1.
 *
 *   POST { phone, deviceId }
 *
 * Replies:
 *   { ok: true, token }           already this device — straight in
 *   { ok: false, status: "otp_sent" }        first time — a code went out on WhatsApp
 *   { ok: false, status: "device_mismatch" } bound to another phone (ask the gym)
 *   { ok: false, reason: "not_found" | "not_active" | "invalid" | "locked" }
 */

const RULE: LimitRule = { max: 10, windowMs: 10 * 60_000, lockMs: 20 * 60_000 };

export async function POST(req: NextRequest) {
  let body: { phone?: unknown; deviceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" });
  }
  const phoneRaw = typeof body.phone === "string" ? body.phone : "";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!phoneRaw || !deviceId) return NextResponse.json({ ok: false, reason: "invalid" });

  const key = `applogin:${await clientKey()}`;
  if ((await lockedFor(key)) > 0) return NextResponse.json({ ok: false, reason: "locked" });

  const phone = canonicalPhone(phoneRaw);
  if (phone.length < 8) {
    await recordFailure(key, RULE);
    return NextResponse.json({ ok: false, reason: "not_found" });
  }

  const member = await prisma.member.findUnique({
    where: { phone },
    select: { id: true, name: true, appDeviceId: true, appSessionEpoch: true },
  });
  if (!member) {
    await recordFailure(key, RULE);
    return NextResponse.json({ ok: false, reason: "not_found" });
  }
  if (!(await hasActiveSubscription(member.id))) {
    return NextResponse.json({ ok: false, reason: "not_active" });
  }

  // Already this device → straight in.
  if (member.appDeviceId === deviceId) {
    const token = await tokenForBoundDevice(member.id, deviceId, member.appSessionEpoch);
    return NextResponse.json({ ok: true, token });
  }
  // Bound to a different device → the manager must clear it first.
  if (member.appDeviceId) {
    return NextResponse.json({ ok: false, status: "device_mismatch" });
  }
  // First time on any device → confirm ownership with a WhatsApp code.
  const code = generateOtp();
  await setMemberOtp(member.id, code);
  await sendOtp(member.name, phone, code);
  return NextResponse.json({ ok: false, status: "otp_sent" });
}
