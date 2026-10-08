import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalPhone } from "@/lib/phone";
import { hasActiveSubscription, verifyOtpAndBind } from "@/lib/member-app/auth";
import { clientKey, lockedFor, recordFailure, clearFailures, type LimitRule } from "@/lib/rate-limit";

/**
 * Member app sign-in, step 2 — the one-time code.
 *
 *   POST { phone, deviceId, code }
 *   → { ok: true, token } | { ok: false, reason: "bad_code" | "invalid" | "locked" }
 *
 * On success the device is bound to the account, so later sign-ins skip the code.
 */

const RULE: LimitRule = { max: 6, windowMs: 10 * 60_000, lockMs: 20 * 60_000 };

export async function POST(req: NextRequest) {
  let body: { phone?: unknown; deviceId?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" });
  }
  const phone = canonicalPhone(typeof body.phone === "string" ? body.phone : "");
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (phone.length < 8 || !deviceId || !/^\d{4,8}$/.test(code)) {
    return NextResponse.json({ ok: false, reason: "invalid" });
  }

  const key = `appverify:${await clientKey()}`;
  if ((await lockedFor(key)) > 0) return NextResponse.json({ ok: false, reason: "locked" });

  const member = await prisma.member.findUnique({ where: { phone }, select: { id: true } });
  // Re-check the subscription here too, so a lapse between the two steps is caught.
  if (!member || !(await hasActiveSubscription(member.id))) {
    await recordFailure(key, RULE);
    return NextResponse.json({ ok: false, reason: "bad_code" });
  }

  const res = await verifyOtpAndBind(member.id, deviceId, code);
  if (!res.ok) {
    await recordFailure(key, RULE);
    return NextResponse.json({ ok: false, reason: "bad_code" });
  }
  await clearFailures(key);
  return NextResponse.json({ ok: true, token: res.token });
}
