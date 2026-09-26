"use server";

import { redirect } from "next/navigation";
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

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { username, password } = parsed.data;
  // Throttle per address AND per username, so neither a single machine
  // spraying names nor many machines targeting one account gets free rein.
  const ip = await clientKey();
  const keys = [`login:ip:${ip}`, `login:user:${username.toLowerCase()}`];

  const locked = Math.max(...(await Promise.all(keys.map(lockedFor))));
  if (locked > 0) {
    return { error: "locked", lockedMinutes: Math.ceil(locked / 60_000) };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  // Hash even when the username is unknown, so response time does not reveal
  // which accounts exist.
  const ok = await verifyPassword(password, user?.hashedPassword ?? DUMMY_HASH);

  if (!user || !ok) {
    const lockMs = Math.max(
      ...(await Promise.all(keys.map((k) => recordFailure(k, LOGIN_RULE))))
    );
    if (lockMs > 0) {
      return { error: "locked", lockedMinutes: Math.ceil(lockMs / 60_000) };
    }
    return {
      error: "invalid_credentials",
      attemptsLeft: Math.min(
        ...(await Promise.all(keys.map((k) => attemptsLeft(k, LOGIN_RULE))))
      ),
    };
  }

  if (!user.isActive) {
    // A disabled account still counts as a failed attempt.
    await recordFailure(keys[0], LOGIN_RULE);
    return { error: "disabled" };
  }

  // The master signs in at its own address and nowhere else. Reported as bad
  // credentials rather than "wrong door", which would confirm the account
  // exists to anyone who found the name.
  if (user.role === "MASTER") {
    await recordFailure(keys[0], LOGIN_RULE);
    return { error: "invalid_credentials" };
  }

  await Promise.all(keys.map(clearFailures));

  await createSession({
    userId: user.id,
    role: user.role,
    username: user.username,
    displayName: user.displayName,
  });

  redirect(safeNext(formData.get("next")) ?? roleHome(user.role));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

/**
 * The master's own door.
 *
 * Everything the ordinary sign-in does — same throttle, same constant-time
 * hashing, same silence about which half was wrong — with two differences:
 * the caller must have arrived through the secret address, and only a master
 * account is accepted. A manager's password typed here fails exactly as a
 * wrong password does.
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

  const { username, password } = parsed.data;
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
