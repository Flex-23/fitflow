import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Throttle for the public entry points (staff login, member phone check).
 *
 * The counters live in the database rather than in process memory: the app
 * runs as serverless functions, so each request may hit a fresh instance and
 * an in-memory Map would let an attacker start from zero every time.
 *
 * Every helper fails open — a database hiccup must never lock the gym's staff
 * out of their own system.
 */

export type LimitRule = {
  /** Failures allowed inside the window before locking. */
  max: number;
  /** How long the failures are remembered (ms). */
  windowMs: number;
  /** How long the key stays locked once `max` is hit (ms). */
  lockMs: number;
};

export const LOGIN_RULE: LimitRule = {
  max: 5,
  windowMs: 15 * 60_000,
  lockMs: 15 * 60_000,
};

export const WATCH_RULE: LimitRule = {
  max: 10,
  windowMs: 10 * 60_000,
  lockMs: 10 * 60_000,
};

/** Best-effort client address; falls back to a shared key behind a proxy. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "local";
}

/** Milliseconds left on the lock, or 0 when the key may proceed. */
export async function lockedFor(key: string): Promise<number> {
  try {
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    if (!row?.lockedUntil) return 0;
    return Math.max(0, row.lockedUntil.getTime() - Date.now());
  } catch {
    return 0;
  }
}

/** Record a failure; returns the lock time in ms once the limit is hit. */
export async function recordFailure(key: string, rule: LimitRule): Promise<number> {
  try {
    const now = new Date();
    const row = await prisma.rateLimit.findUnique({ where: { key } });

    // First failure, or the previous window has aged out.
    if (!row || now.getTime() - row.firstFailAt.getTime() > rule.windowMs) {
      await prisma.rateLimit.upsert({
        where: { key },
        update: { fails: 1, firstFailAt: now, lockedUntil: null },
        create: { key, fails: 1, firstFailAt: now },
      });
      return 0;
    }

    const fails = row.fails + 1;
    const lock = fails >= rule.max;
    await prisma.rateLimit.update({
      where: { key },
      data: { fails, lockedUntil: lock ? new Date(now.getTime() + rule.lockMs) : null },
    });
    return lock ? rule.lockMs : 0;
  } catch {
    return 0;
  }
}

/** Clear the counter after a success. */
export async function clearFailures(key: string): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } });
  } catch {
    // Nothing to do — the row ages out of its window anyway.
  }
}

/** Attempts left before the key locks (for a friendlier message). */
export async function attemptsLeft(key: string, rule: LimitRule): Promise<number> {
  try {
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    if (!row || Date.now() - row.firstFailAt.getTime() > rule.windowMs) return rule.max;
    return Math.max(0, rule.max - row.fails);
  } catch {
    return rule.max;
  }
}
