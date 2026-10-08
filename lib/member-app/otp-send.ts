import "server-only";
import { prisma } from "@/lib/prisma";
import { isWhatsAppEnabled, toInternational } from "@/lib/whatsapp";

/**
 * Queue the one-time login code to the member over WhatsApp — the same free
 * channel (the gym's own number via the worker) the portal links already use.
 * When WhatsApp is not linked the row still queues; a staff member can read it
 * from the outbox, but normally the worker sends it within seconds.
 */
export async function sendOtp(memberName: string, phone: string, code: string): Promise<void> {
  const text = `رمز الدخول إلى التطبيق: ${code}\nلا تشاركه مع أحد.`;
  if (!isWhatsAppEnabled()) return; // nothing to send through; the code still verifies
  await prisma.whatsAppOutbox.create({
    data: { kind: "otp", memberName, phone: toInternational(phone), text },
  });
}
