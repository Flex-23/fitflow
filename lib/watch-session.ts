import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * Member watch session.
 *
 * A member opens an exercise link from their course PDF, proves ownership once
 * with their phone number, and then keeps a signed, httpOnly cookie for an
 * hour — every other exercise link in that PDF plays straight away.
 *
 * The cookie is scoped to the member (not to one video), which is what makes
 * a single verification cover the whole course.
 */
export const WATCH_COOKIE = "fitflow_watch";
export const WATCH_TTL_MS = 60 * 60 * 1000; // 1 hour

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export type WatchSession = { memberId: string; name: string; expiresAt: number };

export async function createWatchSession(memberId: string, name: string) {
  const expiresAt = new Date(Date.now() + WATCH_TTL_MS);
  const token = await new SignJWT({ m: memberId, n: name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key());

  const store = await cookies();
  store.set(WATCH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getWatchSession(): Promise<WatchSession | null> {
  const token = (await cookies()).get(WATCH_COOKIE)?.value;
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

export async function clearWatchSession() {
  (await cookies()).delete(WATCH_COOKIE);
}
