import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * Member session — "this phone belongs to member X".
 *
 * One session serves both things a member does: opening their own page and
 * watching an exercise video. Two ways in, both ending here:
 *
 *   - the personal link sent to them over WhatsApp (`/me?k=…`), which is the
 *     normal route and asks them for nothing;
 *   - typing their phone number on a video link, kept for members who never
 *     opened their page.
 *
 * Long-lived on purpose: it backs an icon on a home screen, and the point is
 * that it keeps working. Length is not what protects the data — every page
 * re-checks that the member still holds a running subscription before showing
 * anything, so a cancelled member's saved session stops working by itself.
 */
export const MEMBER_COOKIE = "fitflow_member";
export const MEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export type MemberSession = { memberId: string; name: string; expiresAt: number };

export async function createMemberSession(memberId: string, name: string) {
  const expiresAt = new Date(Date.now() + MEMBER_TTL_MS);
  const token = await new SignJWT({ m: memberId, n: name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key());

  const store = await cookies();
  store.set(MEMBER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getMemberSession(): Promise<MemberSession | null> {
  const token = (await cookies()).get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.m !== "string" || typeof payload.exp !== "number") return null;
    return {
      memberId: payload.m,
      name: typeof payload.n === "string" ? payload.n : "",
      expiresAt: payload.exp * 1000,
    };
  } catch {
    // Expired or tampered with — treated as no session.
    return null;
  }
}

export async function clearMemberSession() {
  (await cookies()).delete(MEMBER_COOKIE);
}
