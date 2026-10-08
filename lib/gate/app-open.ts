import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { isGateEnabled } from "@/lib/gate/enabled";

/**
 * "Open the gate from the member's page/app" — an experimental, opt-in feature,
 * entirely separate from the panel's own card memory (the hybrid bridge is
 * untouched). Off by default; the master turns it on per gym.
 */
export const GATE_APP_OPEN_KEY = "gate.appOpen";

export async function isAppGateOpenEnabled(): Promise<boolean> {
  return (await getSetting(GATE_APP_OPEN_KEY, "")) === "true";
}

/** How long a tap stays actionable before the bridge ignores it. */
export const APP_OPEN_TTL_MS = 60_000;

/**
 * Movement cap per member per day, counted separately for each direction.
 * Unlimited during the trial — restore to 2 (or the agreed number) later.
 */
export const APP_OPEN_MAX_PER_DIRECTION = Infinity;

export type GateDirection = "in" | "out";

export type GateOpenResult =
  | { ok: true }
  | { ok: false; reason: "off" | "not_active" | "too_many" | "error" };

/**
 * The shared core, called by both the web action (member session) and the app
 * API (bearer token). Checks the feature is on, the member has an active
 * subscription, and the daily cap, then queues a short-lived open command for
 * the bridge. The caller is responsible for identifying the member.
 */
export async function createGateOpenCommand(
  memberId: string,
  directionRaw: string
): Promise<GateOpenResult> {
  const direction: GateDirection = directionRaw === "out" ? "out" : "in";

  const [gateOn, appOn] = await Promise.all([isGateEnabled(), isAppGateOpenEnabled()]);
  if (!gateOn || !appOn) return { ok: false, reason: "off" };

  const now = new Date();
  const active = await prisma.subscription.findFirst({
    where: {
      memberId,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ status: "ACTIVE" }, { status: "FROZEN", freezeUntil: { lte: now } }],
    },
    select: { id: true },
  });
  if (!active) return { ok: false, reason: "not_active" };

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const used = await prisma.gateCommand.count({
    where: { memberId, direction, createdAt: { gte: startOfDay }, status: { in: ["pending", "done"] } },
  });
  if (used >= APP_OPEN_MAX_PER_DIRECTION) return { ok: false, reason: "too_many" };

  try {
    await prisma.gateCommand.create({
      data: { memberId, direction, status: "pending", expiresAt: new Date(Date.now() + APP_OPEN_TTL_MS) },
    });
  } catch {
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}
