"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, FileDown, Link2, Check, MessageCircle, Loader2 } from "lucide-react";
import { sendCourseToMember, type QueueCourseResult } from "@/app/actions/whatsapp";
import { Button } from "@/components/ui/button";
import { desktopLink, buildCourseMessage } from "@/lib/whatsapp";
import type { Dictionary } from "@/lib/i18n";

/**
 * Turn a queue result into the right toast. Shared with the builders.
 *
 * Success here means "handed to the gym computer", not "delivered" — the
 * worker sends it moments later, and the Settings page shows anything stuck.
 */
export function reportSend(res: QueueCourseResult, memberName: string, dict: Dictionary) {
  const t = dict.captain;
  if (res.ok) {
    toast.success(
      res.alreadyQueued ? t.whatsappAlreadyQueued : `${t.whatsappQueuedToast} — ${memberName}`
    );
    return;
  }
  const messages: Record<string, string> = {
    no_phone: t.errNotOnWhatsApp,
    not_found: t.errNotFound,
    disabled: t.whatsappStub,
  };
  toast.error(messages[res.reason] ?? dict.common.somethingWrong, { duration: 8000 });
}

/**
 * Delivery controls for a saved course: resend the PDF straight from the
 * server, download it, copy the share link, or fall back to opening WhatsApp
 * by hand when the gym number is not linked.
 */
export function WhatsAppSend({
  courseId,
  phone,
  memberName,
  kind,
  shareToken,
  pdfUrl,
  dict,
  enabled,
}: {
  courseId: string;
  phone: string;
  memberName: string;
  kind: "training" | "nutrition";
  shareToken: string | null;
  /** Staff-only preview URL, used for the manual download. */
  pdfUrl: string;
  dict: Dictionary;
  enabled: boolean;
}) {
  const t = dict.captain;
  const [copied, setCopied] = useState(false);
  const [sending, startSending] = useTransition();

  if (!enabled) return null;

  function resend() {
    startSending(async () => {
      const res = await sendCourseToMember(kind, courseId);
      reportSend(res, memberName, dict);
    });
  }

  async function copyLink() {
    if (!shareToken) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${shareToken}`);
      setCopied(true);
      toast.success(t.linkCopied);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(dict.common.somethingWrong);
    }
  }

  function openApp() {
    const url = shareToken ? `${window.location.origin}/p/${shareToken}` : "";
    window.location.href = desktopLink(phone, buildCourseMessage(memberName, kind, url));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="brand" onClick={resend} disabled={sending}>
        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {sending ? t.sending : t.resend}
      </Button>
      <Button asChild variant="outline">
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download>
          <FileDown className="size-4" />
          {t.downloadPdf}
        </a>
      </Button>
      {shareToken && (
        <Button variant="ghost" size="icon" title={t.copyLink} onClick={copyLink}>
          {copied ? <Check className="size-4 text-success" /> : <Link2 className="size-4" />}
        </Button>
      )}
      <Button variant="ghost" size="icon" title={t.openInApp} onClick={openApp}>
        <MessageCircle className="size-4" />
      </Button>
    </div>
  );
}
