import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * Member app authentication.
 *
 * The member signs in with their phone number. The number must belong to a
 * member with an active subscription. One device per account: the first login
 * is confirmed with a one-time code over WhatsApp, after which that device is
 * bound — another phone is refused until the manager clears the binding.
 *
 * The app holds a long-lived token (180 days) carrying the member id, the
 * bound device id, and an epoch; every request re-checks all three against the
 * database, so a manager reset or a lost-phone bump invalidates it at once.
 */

const APP_TOKEN_TTL_S = 180 * 24 * 60 * 60; // 180 days
const OTP_TTL_MS = 5 * 60_000; // 5 minutes

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export type AppToken = { memberId: string; deviceId: string; epoch: number };

export async function mintAppToken(t: AppToken): Promise<string> {
  return new SignJWT({ m: t.memberId, d: t.deviceId, e: t.epoch })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + APP_TOKEN_TTL_S)
    .sign(key());
}

/** Signature + shape check only (no database). */
export async function decodeAppToken(token: string | undefined): Promise<AppToken | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.m === "string" && typeof payload.d === "string" && typeof payload.e === "number") {
      return { memberId: payload.m, deviceId: payload.d, epoch: payload.e };
    }
    return null;
  } catch {
    return null;
  }
}

export type AppMember = {
  id: string;
  name: string;
  phone: string;
  gender: "MALE" | "FEMALE";
};

/**
 * The member behind a Bearer token, or null. Enforces the binding: the token's
 * device must still be the one on file and its epoch current.
 */
export async function memberFromAuthHeader(authHeader: string | null): Promise<AppMember | null> {
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const decoded = await decodeAppToken(token ?? undefined);
  if (!decoded) return null;

  const member = await prisma.member.findUnique({
    where: { id: decoded.memberId },
    select: { id: true, name: true, phone: true, gender: true, appDeviceId: true, appSessionEpoch: true },
  });
  if (!member) return null;
  if (member.appDeviceId !== decoded.deviceId) return null;
  if (member.appSessionEpoch !== decoded.epoch) return null;
  return { id: member.id, name: member.name, phone: member.phone, gender: member.gender };
}

/** True when the member has a subscription covering today (door's rule). */
export async function hasActiveSubscription(memberId: string, now = new Date()): Promise<boolean> {
  const sub = await prisma.subscription.findFirst({
    where: {
      memberId,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ status: "ACTIVE" }, { status: "FROZEN", freezeUntil: { lte: now } }],
    },
    select: { id: true },
  });
  return !!sub;
}

/** A 6-digit one-time code. */
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function setMemberOtp(memberId: string, code: string): Promise<void> {
  await prisma.member.update({
    where: { id: memberId },
    data: { appOtpHash: await hashPassword(code), appOtpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
}

/** Check a code and, on success, bind the device and issue a token. */
export async function verifyOtpAndBind(
  memberId: string,
  deviceId: string,
  code: string
): Promise<{ ok: true; token: string } | { ok: false }> {
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: { appOtpHash: true, appOtpExpiresAt: true, appSessionEpoch: true },
  });
  if (!m || !m.appOtpHash || !m.appOtpExpiresAt || m.appOtpExpiresAt.getTime() < Date.now()) {
    return { ok: false };
  }
  if (!(await verifyPassword(code, m.appOtpHash))) return { ok: false };

  await prisma.member.update({
    where: { id: memberId },
    data: { appDeviceId: deviceId, appBoundAt: new Date(), appOtpHash: null, appOtpExpiresAt: null },
  });
  const token = await mintAppToken({ memberId, deviceId, epoch: m.appSessionEpoch });
  return { ok: true, token };
}

/** Issue a token for an already-bound device (no OTP needed). */
export async function tokenForBoundDevice(memberId: string, deviceId: string, epoch: number): Promise<string> {
  return mintAppToken({ memberId, deviceId, epoch });
}

/**
 * Manager action: let the member sign in on a new phone. Clears the bound
 * device and bumps the epoch so the old phone's token stops working at once;
 * the member's next sign-in confirms the new device with a fresh WhatsApp code.
 */
export async function resetMemberDevice(memberId: string): Promise<void> {
  await prisma.member.update({
    where: { id: memberId },
    data: {
      appDeviceId: null,
      appBoundAt: null,
      appOtpHash: null,
      appOtpExpiresAt: null,
      appSessionEpoch: { increment: 1 },
    },
  });
}
