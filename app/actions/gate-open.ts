"use server";

import { getMemberSession } from "@/lib/member-session";
import { createGateOpenCommand } from "@/lib/gate/app-open";
import { clientKey, lockedFor, recordFailure, clearFailures, type LimitRule } from "@/lib/rate-limit";

/**
 * A member opens the gate from their own web page. Thin wrapper over the shared
 * core (lib/gate/app-open.ts) — it adds the member session and a throttle; the
 * core does the feature/subscription/limit checks and queues the command.
 */

export type GateOpenResult =
  | { ok: true }
  | { ok: false; reason: "off" | "no_session" | "not_active" | "too_many" | "locked" | "error" };

const OPEN_RULE: LimitRule = { max: 8, windowMs: 5 * 60_000, lockMs: 10 * 60_000 };

export async function requestGateOpen(direction: string): Promise<GateOpenResult> {
  const session = await getMemberSession();
  if (!session) return { ok: false, reason: "no_session" };

  const key = `gateopen:${await clientKey()}`;
  if ((await lockedFor(key)) > 0) return { ok: false, reason: "locked" };

  const res = await createGateOpenCommand(session.memberId, direction);
  if (!res.ok && res.reason === "not_active") await recordFailure(key, OPEN_RULE);
  if (res.ok) await clearFailures(key);
  return res;
}
