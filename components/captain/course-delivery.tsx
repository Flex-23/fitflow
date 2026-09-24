"use client";

import { WhatsAppSend } from "@/components/captain/whatsapp-send";
import { PortalLinkButton } from "@/components/portal-link-button";
import type { Dictionary } from "@/lib/i18n";

/**
 * How a saved course reaches the member.
 *
 * Sending the PDF over WhatsApp is paused, so the normal route is now the
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
