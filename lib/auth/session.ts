import "server-only";
import { cookies } from "next/headers";
import {
  decryptSession,
  encryptSession,
  SESSION_COOKIE,
  type SessionPayload,
} from "./session-crypto";

/** One working shift: staff sign in again the next day. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export async function createSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const token = await encryptSession(payload, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return decryptSession(token);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export type { SessionPayload };
