import "server-only";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { isLocalUrl } from "@/lib/app-url";
import { currentAppUrl } from "@/lib/current-url";
import { buildPortalMessage, isWhatsAppEnabled, toInternational, webLink } from "@/lib/whatsapp";
import { issuePortalToken } from "@/lib/member-portal";

/**
 * Getting a member the link to their own page.
 *
 * When the gym's number is linked the message goes out by itself: the row is
 * queued here and the worker on the gym computer sends it, so nobody has to
 * open WhatsApp or a browser tab. When it is not linked — the number was
 * never paired, or the gym computer is off — the same message comes back as
 * a chat link for a member of staff to send by hand, which is better than
 * telling them it cannot be done.
 *
 * Lives outside the actions file because saving a course calls it too, and a
 * "use server" module may only export things that are themselves actions.
 */

export type PortalLinkResult =
  | { ok: true; sent: "queued" }
  | { ok: true; sent: "manual"; url: string; web: string; local: boolean }
  | { ok: false; reason: "not_found" | "no_phone" };

export async function deliverPortalLink(
  staffId: string,
  member: { id: string; name: string; phone: string }
): Promise<PortalLinkResult> {
  if (!member.phone) return { ok: false, reason: "no_phone" };

  const token = await issuePortalToken(member.id);
  if (!token) return { ok: false, reason: "not_found" };

  // `m` names the member the link is for. It unlocks nothing — the token is
  // the credential — but it lets a link that has already been used tell
  // "this phone is already signed in as the right person" apart from "this
  // phone is signed in as somebody else" (see /me/enter).
  const url = `${await currentAppUrl()}/me/enter?k=${token}&m=${member.id}`;
  const text = buildPortalMessage(member.name, url);
  const phone = toInternational(member.phone);

  await logActivity({
    userId: staffId,
    action: "SEND_PORTAL_LINK",
    targetType: "Member",
    targetId: member.id,
    details: `${member.name} • +${phone}`,
  });

  if (isWhatsAppEnabled()) {
    await prisma.whatsAppOutbox.create({
      data: { kind: "portal", memberName: member.name, phone, text, requestedById: staffId },
    });
    return { ok: true, sent: "queued" };
  }

  return {
    ok: true,
    sent: "manual",
    url,
    web: webLink(member.phone, text),
    local: isLocalUrl(url),
  };
}

/**
 * Send the link that goes out with a freshly saved course.
 *
 * Never throws: a course that saved must still be reported as saved, whatever
 * the message did, so the caller gets a result to show and nothing else.
 */
export async function sendCourseLink(
  staffId: string,
  memberId: string
): Promise<PortalLinkResult | null> {
  try {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, name: true, phone: true },
    });
    if (!member) return null;
    return await deliverPortalLink(staffId, member);
  } catch {
    return null;
  }
}
