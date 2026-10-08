import type { PrismaClient } from "@prisma/client";

/**
 * The gate rule, shared by the bridge (and anything that wants to preview it).
 *
 * A card gets in when its member holds an ACTIVE subscription whose dates
 * cover "now". Dates are checked directly — not just the status flag —
 * because the app only flips ACTIVE→EXPIRED lazily when a staff page loads.
 * Deliberately mirrors app/actions/watch.ts so the door and the video links
 * agree on who is a paying member.
 *
 * No server-only import: scripts/gate-bridge.ts runs this outside Next.js.
 */

export type GateReason = "unknown_card" | "no_subscription" | "expired" | "frozen" | "cancelled";

export type GateDecision =
  | { allow: true; member: { id: string; name: string; phone: string }; detail: string }
  | { allow: false; member: { id: string; name: string; phone: string } | null; reason: GateReason };

export async function decideEntry(
  prisma: PrismaClient,
  /** Card number exactly as the panel reported it (Wiegand-26 form). */
  panelCard: number,
  now: Date = new Date()
): Promise<GateDecision> {
  const member = await prisma.member.findFirst({
    where: { cardWiegand: panelCard },
    select: {
      id: true,
      name: true,
      phone: true,
      subscriptions: {
        orderBy: { endDate: "desc" },
        take: 5,
        select: { status: true, planName: true, startDate: true, endDate: true, freezeUntil: true },
      },
    },
  });
  if (!member) return { allow: false, member: null, reason: "unknown_card" };

  const who = { id: member.id, name: member.name, phone: member.phone };
  const subs = member.subscriptions;

  // A freeze whose end has passed is effectively over: the status flips
  // FROZEN→ACTIVE only lazily (on a staff page load), but the door must not
  // wait for that — the member has paid and their freeze has elapsed.
  const frozenEnded = (s: { status: string; freezeUntil: Date | null }) =>
    s.status === "FROZEN" && s.freezeUntil != null && s.freezeUntil <= now;
  const stillFrozen = (s: { status: string; freezeUntil: Date | null }) =>
    s.status === "FROZEN" && !(s.freezeUntil != null && s.freezeUntil <= now);

  const running = subs.find(
    (s) => (s.status === "ACTIVE" || frozenEnded(s)) && s.startDate <= now && s.endDate >= now
  );
  if (running) {
    const daysLeft = Math.ceil((running.endDate.getTime() - now.getTime()) / 86_400_000);
    return { allow: true, member: who, detail: `${running.planName} · ${daysLeft}d` };
  }

  if (subs.some((s) => stillFrozen(s) && s.endDate >= now)) {
    return { allow: false, member: who, reason: "frozen" };
  }
  if (subs.length === 0) return { allow: false, member: who, reason: "no_subscription" };
  if (subs.every((s) => s.status === "CANCELLED")) {
    return { allow: false, member: who, reason: "cancelled" };
  }
  return { allow: false, member: who, reason: "expired" };
}
