"use server";

import { revalidatePath } from "next/cache";
import { requireAnySection } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { deliverPortalLink, type PortalLinkResult } from "@/lib/portal-delivery";
import { revokePortalSessions } from "@/lib/member-portal";

export type { PortalLinkResult };

/** Send a member the link to their own page. */
export async function sendPortalLink(memberId: string): Promise<PortalLinkResult> {
  // Captains send this too — it is how a member reaches the course they
  // just wrote.
  const user = await requireAnySection("RECEPTION", "COACHING");

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, phone: true },
  });
  if (!member) return { ok: false, reason: "not_found" };

  const res = await deliverPortalLink(user.id, member);
  revalidatePath("/members");
  return res;
}

/**
 * Sign this member out of every device, and kill any link still in flight.
 *
 * What a lost or stolen phone needs. The member is not locked out for good —
 * the next link the desk sends brings them back.
 */
export async function revokeMemberDevices(memberId: string): Promise<{ ok: boolean }> {
  const user = await requireAnySection("RECEPTION", "COACHING");

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { name: true },
  });
  if (!member) return { ok: false };

  const ok = await revokePortalSessions(memberId);
  if (!ok) return { ok: false };

  await logActivity({
    userId: user.id,
    action: "REVOKE_PORTAL_ACCESS",
    targetType: "Member",
    targetId: memberId,
    details: member.name,
  });

  revalidatePath("/members");
  return { ok: true };
}
