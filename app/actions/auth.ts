"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@/schemas/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword, DUMMY_HASH } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/rbac";
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

/** Only same-origin, non-protocol-relative paths may be used as a landing page. */
function safeNext(value: FormDataEntryValue | null): string | null {
  const next = typeof value === "string" ? value : "";
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
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

  const locked = Math.max(...keys.map(lockedFor));
  if (locked > 0) {
    return { error: "locked", lockedMinutes: Math.ceil(locked / 60_000) };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  // Hash even when the username is unknown, so response time does not reveal
  // which accounts exist.
  const ok = await verifyPassword(password, user?.hashedPassword ?? DUMMY_HASH);

  if (!user || !ok) {
    const lockMs = Math.max(...keys.map((k) => recordFailure(k, LOGIN_RULE)));
    if (lockMs > 0) {
      return { error: "locked", lockedMinutes: Math.ceil(lockMs / 60_000) };
    }
    return {
      error: "invalid_credentials",
      attemptsLeft: Math.min(...keys.map((k) => attemptsLeft(k, LOGIN_RULE))),
    };
  }

  if (!user.isActive) {
    // A disabled account still counts as a failed attempt.
    recordFailure(keys[0], LOGIN_RULE);
    return { error: "disabled" };
  }

  keys.forEach(clearFailures);

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
