"use server";

import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { loginSchema } from "@/schemas/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword, DUMMY_HASH } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/rbac";
import { isStaffPath } from "@/lib/auth/routes";
import { isMasterGate } from "@/lib/auth/master-gate";
import {
  clientKey,
  lockedFor,
  recordFailure,
  clearFailures,
  attemptsLeft,
  LOGIN_RULE,
} from "@/lib/rate-limit";

export type LoginState = {
  error?: "invalid" | "invalid_credentials" | "disabled" | "locked";
  /** Minutes left on the lock, shown with the "locked" error. */
  lockedMinutes?: number;
  /** Attempts left before the account locks. */
  attemptsLeft?: number;
  /**
   * The account the answer is about, on the pick-your-name doors — so that
   * picking a different account clears a lock message that is not its own.
   */
  forUser?: string;
};

/**
 * Where to land after signing in, when the form carries a destination.
 *
 * Same-origin and not protocol-relative, as always — and now also a page
 * that exists. A crafted or mistyped "next" used to be honoured, so a
 * correct sign-in could end on a 404.
 */
function safeNext(value: FormDataEntryValue | null): string | null {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return isStaffPath(next.split("?")[0]!) ? next : null;
}

/**
 * The throttle belongs to the account, not to the connection.
 *
 * The whole gym signs in from one internet address, so a per-address lock
 * meant five wrong passwords at the desk locked every member of staff out.
 * Now only the account being guessed at locks: switch to another account and
 * you can sign in; come back to the locked one and it is still locked.
 */
const accountKey = (username: string) => `login:user:${username.toLowerCase()}`;

/** Verify a password for an account that must hold `role`; shared by both doors. */
async function signInAs(
  user: { id: string; username: string; displayName: string; role: Role; isActive: boolean; deletedAt: Date | null; hashedPassword: string } | null,
  role: Role,
  password: string,
  key: string,
  next: FormDataEntryValue | null
): Promise<LoginState> {
  const forUser = user?.id;
  const locked = await lockedFor(key);
  if (locked > 0) {
    return { error: "locked", lockedMinutes: Math.ceil(locked / 60_000), forUser };
  }

  // Hash even when there is no such account, so response time does not
  // reveal which accounts exist.
  const ok = await verifyPassword(password, user?.hashedPassword ?? DUMMY_HASH);

  // Wrong password, no such account, deleted, or an account of another role
  // at this door — all one answer, and all one failed attempt.
  if (!user || !ok || user.role !== role || user.deletedAt) {
    const lockMs = await recordFailure(key, LOGIN_RULE);
    if (lockMs > 0) {
      return { error: "locked", lockedMinutes: Math.ceil(lockMs / 60_000), forUser };
    }
    return {
      error: "invalid_credentials",
      attemptsLeft: await attemptsLeft(key, LOGIN_RULE),
      forUser,
    };
  }

  if (!user.isActive) {
    await recordFailure(key, LOGIN_RULE);
    return { error: "disabled", forUser };
  }

  await clearFailures(key);
  await createSession({
    userId: user.id,
    role: user.role,
    username: user.username,
    displayName: user.displayName,
  });
  redirect(safeNext(next) ?? roleHome(user.role));
}

/** The manager's door: username and password, managers only. */
export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid" };

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  return signInAs(user, "MANAGER", password, accountKey(username), formData.get("next"));
}

/**
 * The reception and captain doors: pick your account from the list, type
 * the password. The account arrives as its id, so nobody has to know or type
 * a username.
 */
export async function pickLogin(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const kind = formData.get("kind");
  const role: Role | null =
    kind === "RECEPTION" ? "RECEPTION" : kind === "CAPTAIN" ? "CAPTAIN" : null;
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!role || !userId || !password) return { error: "invalid" };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // The same key as the manager's door uses for this account, so the lock
  // follows the account whichever page it is tried from.
  const key = user ? accountKey(user.username) : `login:uid:${userId}`;
  return signInAs(user, role, password, key, formData.get("next"));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

/**
 * The master check and sign-in itself, shared by both master doors below.
 * Same throttle, same constant-time hashing, same silence about which half
 * was wrong as the ordinary sign-in — only a master account is accepted, and
 * a manager's password typed here fails exactly as a wrong password does.
 */
async function masterSignIn(username: string, password: string): Promise<LoginState> {
  const ip = await clientKey();
  const keys = [`master:ip:${ip}`, `master:user:${username.toLowerCase()}`];

  const locked = Math.max(...(await Promise.all(keys.map(lockedFor))));
  if (locked > 0) {
    return { error: "locked", lockedMinutes: Math.ceil(locked / 60_000) };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const ok = await verifyPassword(password, user?.hashedPassword ?? DUMMY_HASH);

  // One answer for "no such user", "wrong password" and "not the master", so
  // this page cannot be used to find out which accounts are which.
  if (!user || !ok || user.role !== "MASTER" || !user.isActive) {
    const lockMs = Math.max(
      ...(await Promise.all(keys.map((k) => recordFailure(k, LOGIN_RULE))))
    );
    if (lockMs > 0) {
      return { error: "locked", lockedMinutes: Math.ceil(lockMs / 60_000) };
    }
    return { error: "invalid_credentials" };
  }

  await Promise.all(keys.map(clearFailures));

  await createSession({
    userId: user.id,
    role: user.role,
    username: user.username,
    displayName: user.displayName,
  });

  redirect("/master");
}

/**
 * The master's own door, on the single-gym deployment.
 *
 * The caller must have arrived through the secret address (`/access/<gate>`)
 * on top of everything `masterSignIn` checks.
 */
export async function masterLogin(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  // Whoever is calling has to know the address, not merely the action.
  const gate = formData.get("gate");
  if (typeof gate !== "string" || !isMasterGate(gate)) {
    return { error: "invalid_credentials" };
  }

  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "invalid" };

  return masterSignIn(parsed.data.username, parsed.data.password);
}
