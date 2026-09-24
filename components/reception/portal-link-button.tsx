"use client";

import { useTransition } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { sendPortalLink } from "@/app/actions/portal";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/**
 * Sends a member the link to their own page over WhatsApp.
 *
 * The chat is opened in the staff member's own WhatsApp — the desktop app
 * when it is installed, the browser otherwise — with the message already
 * written. They press send, which keeps a person in the loop and means this
 * works even when the gym computer's WhatsApp worker is offline.
 *
 * The link is also copied to the clipboard, for the times the member is
 * standing at the desk and it is quicker to paste it somewhere else.
 */
export function PortalLinkButton({
  memberId,
  dict,
}: {
  memberId: string;
  dict: Dictionary;
}) {
  const t = dict.reception;
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const res = await sendPortalLink(memberId);

      if (!res.ok) {
        toast.error(res.reason === "no_phone" ? t.appLinkNoPhone : dict.common.somethingWrong);
        return;
      }

      // A localhost link is useless on a phone; say so rather than let
      // someone send it and wonder why nothing opens.
      if (res.local) toast.warning(t.appLinkLocal);

      try {
        await navigator.clipboard.writeText(res.url);
      } catch {
        // Clipboard access is refused outside a secure context; the WhatsApp
        // message still carries the link, which is the point.
      }

      toast.success(t.appLinkSent);

      // wa.me rather than the whatsapp:// scheme: it hands over to the
      // desktop app when one is installed and falls back to WhatsApp Web
      // when it is not, so there is no second window to open blindly.
      window.open(res.web, "_blank", "noopener");
    });

  return (
    <Button type="button" variant="outline" onClick={send} disabled={pending}>
      <Smartphone className="size-4" />
      {t.sendAppLink}
    </Button>
  );
}
