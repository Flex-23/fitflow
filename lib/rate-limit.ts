import "server-only";
import { headers } from "next/headers";

/**
 * Small in-memory throttle for the public entry points (staff login, member
 * phone check). The app runs as a single Node process, so a Map is enough —
 * move this to Redis only if it is ever scaled across instances.
 */

type Bucket = { fails: number; lockedUntil: number; firstFail: number };

const globalForLimit = globalThis as unknown as {
  fitflowLimits?: Map<string, Bucket>;
};
const buckets: Map<string, Bucket> =
  globalForLimit.fitflowLimits ?? (globalForLimit.fitflowLimits = new Map());

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
export function lockedFor(key: string): number {
  const b = buckets.get(key);
  if (!b) return 0;
  const left = b.lockedUntil - Date.now();
  if (left <= 0) {
    if (b.lockedUntil > 0) buckets.delete(key);
    return 0;
  }
  return left;
}

/** Record a failure; returns the lock time in ms once the limit is hit. */
export function recordFailure(key: string, rule: LimitRule): number {
  const now = Date.now();
  const b = buckets.get(key);

  // First failure, or the previous window has aged out.
  if (!b || now - b.firstFail > rule.windowMs) {
    buckets.set(key, { fails: 1, firstFail: now, lockedUntil: 0 });
    return 0;
  }

  b.fails += 1;
  if (b.fails >= rule.max) {
    b.lockedUntil = now + rule.lockMs;
    return rule.lockMs;
  }
  return 0;
}

/** Clear the counter after a success. */
export function clearFailures(key: string) {
  buckets.delete(key);
}

/** Attempts left before the key locks (for a friendlier message). */
export function attemptsLeft(key: string, rule: LimitRule): number {
  const b = buckets.get(key);
  if (!b || Date.now() - b.firstFail > rule.windowMs) return rule.max;
  return Math.max(0, rule.max - b.fails);
}
