"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { appUrl, isLocalUrl } from "@/lib/app-url";
import { webLink } from "@/lib/whatsapp";
import {
  issuePortalToken,
  revokePortalSessions,
  PORTAL_LINK_TTL_MS,
} from "@/lib/member-portal";

/**
 * Handing a member the link to their own page.
 *
 * Unlike a course PDF this is not queued for the WhatsApp worker: the link is
 * one line of text, so staff simply press send in their own WhatsApp. That
 * works whether or not the gym computer's worker is running, and it keeps a
 * live credential out of a queue table.
 *
 * The link is good for one opening and ten minutes, so it is sent while the
 * member is there to use it — not filed away for later.
 */

const MINUTES = Math.round(PORTAL_LINK_TTL_MS / 60_000);

export type PortalLinkResult =
  | {
      ok: true;
      url: string;
      /** Opens the chat with the message ready — desktop app or web. */
      web: string;
      /** Minutes the link stays usable, for the confirmation message. */
      minutes: number;
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
    `⏱️ الرابط صالح ${MINUTES} دقائق ولمرة واحدة فقط، فافتحه الآن.`,
    "بعد فتحه اضغط «إضافة إلى الشاشة الرئيسية» ليبقى عندك كتطبيق.",
  ].join("\n");
}

export async function sendPortalLink(memberId: string): Promise<PortalLinkResult> {
  // Captains send this too — it is how a member reaches the course they
  // just wrote.
  const user = await requireRole("RECEPTION", "CAPTAIN");

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, phone: true },
  });
  if (!member) return { ok: false, reason: "not_found" };
  if (!member.phone) return { ok: false, reason: "no_phone" };

  const token = await issuePortalToken(member.id);
  if (!token) return { ok: false, reason: "not_found" };

  const url = `${appUrl()}/me/enter?k=${token}`;

  await logActivity({
    userId: user.id,
    action: "SEND_PORTAL_LINK",
    targetType: "Member",
    targetId: member.id,
    details: `${member.name} • ${member.phone}`,
  });

  revalidatePath("/members");

  return {
    ok: true,
    url,
    web: webLink(member.phone, message(member.name, url)),
    minutes: MINUTES,
    local: isLocalUrl(url),
  };
}

/**
 * Sign this member out of every device, and kill any link still in flight.
 *
 * What a lost or stolen phone needs. The member is not locked out for good —
 * the next link the desk sends brings them back.
 */
export async function revokeMemberDevices(
  memberId: string
): Promise<{ ok: boolean }> {
  const user = await requireRole("RECEPTION", "CAPTAIN");

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
