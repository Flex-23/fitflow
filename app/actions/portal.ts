"use server";

import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { appUrl, isLocalUrl } from "@/lib/app-url";
import { webLink } from "@/lib/whatsapp";
import { getOrCreatePortalToken } from "@/lib/member-portal";

/**
 * Handing a member the link to their own page.
 *
 * Unlike a course PDF this is not queued for the WhatsApp worker: the link is
 * one line of text, so reception simply presses send in their own WhatsApp.
 * That works whether or not the gym computer's worker is running, and it
 * keeps a credential out of a queue table.
 */

export type PortalLinkResult =
  | {
      ok: true;
      url: string;
      /** Opens the chat with the message ready — desktop app or web. */
      web: string;
      /** The address is localhost, so the member could not open the link. */
      local: boolean;
    }
  | { ok: false; reason: "not_found" | "no_phone" };

function message(name: string, url: string): string {
  return [
    `مرحباً ${name} 👋`,
    "هذا رابطك الخاص في FitFlow — يفتح صفحتك مباشرة بدون اسم مستخدم أو كلمة مرور:",
    "",
    url,
    "",
    "افتحه من هاتفك واضغط «إضافة إلى الشاشة الرئيسية» ليصبح تطبيقاً عندك.",
    "الرابط شخصي، لا ترسله لأحد.",
  ].join("\n");
}

export async function sendPortalLink(memberId: string): Promise<PortalLinkResult> {
  const user = await requireRole("RECEPTION");

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, phone: true },
  });
  if (!member) return { ok: false, reason: "not_found" };
  if (!member.phone) return { ok: false, reason: "no_phone" };

  const token = await getOrCreatePortalToken(member.id);
  if (!token) return { ok: false, reason: "not_found" };

  const url = `${appUrl()}/me?k=${token}`;
  const text = message(member.name, url);

  await logActivity({
    userId: user.id,
    action: "SEND_PORTAL_LINK",
    targetType: "Member",
    targetId: member.id,
    details: `${member.name} • ${member.phone}`,
  });

  return {
    ok: true,
    url,
    web: webLink(member.phone, text),
    local: isLocalUrl(url),
  };
}
