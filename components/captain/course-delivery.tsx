"use client";

import { toast } from "sonner";
import { WhatsAppSend } from "@/components/captain/whatsapp-send";
import { PortalLinkButton } from "@/components/portal-link-button";
import type { PortalLinkResult } from "@/lib/portal-delivery";
import type { Dictionary } from "@/lib/i18n";

/**
 * Say what became of the link that went out with a saved course.
 *
 * Saving and sending are one action now, so the captain is told the outcome
 * rather than asked to choose one. Anything other than "queued" leaves the
 * delivery panel on screen, which is where the manual send lives.
 */
export function reportCourseLink(
  link: PortalLinkResult | undefined,
  dict: Dictionary
): boolean {
  const t = dict.captain;
  if (link?.ok && link.sent === "queued") {
    toast.success(t.linkSent);
    return true;
  }
  if (link?.ok === false && link.reason === "no_phone") {
    toast.warning(dict.reception.appLinkNoPhone);
    return false;
  }
  toast.info(t.linkSendManually, { duration: 8000 });
  return false;
}

/**
 * How a saved course reaches the member, when the automatic send did not.
 *
 * Sending the PDF over WhatsApp is paused, so the normal route is the
 * member's own page: one personal link opens it, and the course sits there
 * with everything else. The PDF itself is still one press away for the
 * captain who wants to print or check it.
 *
 * The WhatsApp controls are kept behind `whatsappEnabled` rather than
 * deleted — turning delivery back on is a one-line change, and this is what
 * it switches back to.
 */
export function CourseDelivery({
  courseId,
  kind,
  member,
  shareToken,
  whatsappEnabled,
  dict,
}: {
  courseId: string;
  kind: "training" | "nutrition";
  member: { id: string; name: string; phone: string };
  shareToken: string | null;
  whatsappEnabled: boolean;
  dict: Dictionary;
}) {
  const t = dict.captain;
  const pdfUrl = `/api/courses/${kind}/${courseId}/pdf`;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
      <span className="text-sm font-medium">
        {whatsappEnabled ? t.whatsappReady : t.portalReady}{" "}
        <span className="font-semibold">{member.name}</span>{" "}
        <span className="text-muted-foreground" dir="ltr">
          ({member.phone})
        </span>
      </span>

      <div className="ms-auto flex flex-wrap items-center gap-2">
        {whatsappEnabled ? (
          <WhatsAppSend
            courseId={courseId}
            phone={member.phone}
            memberName={member.name}
            kind={kind}
            shareToken={shareToken}
            pdfUrl={pdfUrl}
            dict={dict}
            enabled={whatsappEnabled}
          />
        ) : (
          <>
            <PortalLinkButton memberId={member.id} dict={dict} variant="brand" />
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-brand hover:underline"
            >
              {t.openPdf}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
