"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { sendPortalLink, revokeMemberDevices } from "@/app/actions/portal";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/**
 * Sends a member the link to their own page over WhatsApp.
 *
 * The chat opens in the staff member's own WhatsApp with the message already
 * written; they press send. A person stays in the loop, and it works whether
 * or not the gym computer's WhatsApp worker is running.
 *
 * The link is good for one opening and ten minutes, so this is pressed while
 * the member is there with their phone — which is why the confirmation says
 * so rather than quietly succeeding.
 */
export function PortalLinkButton({
  memberId,
  dict,
  variant = "outline",
  size,
}: {
  memberId: string;
  dict: Dictionary;
  variant?: "outline" | "soft" | "soft-brand" | "brand";
  size?: "xs" | "sm";
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

      toast.success(t.appLinkSent.replace("{n}", String(res.minutes)), { duration: 8000 });

      // wa.me rather than the whatsapp:// scheme: it hands over to the
      // desktop app when one is installed and falls back to WhatsApp Web
      // when it is not, so there is no second window to open blindly.
      window.open(res.web, "_blank", "noopener");
    });

  return (
    <Button type="button" variant={variant} size={size} onClick={send} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Smartphone className="size-4" />}
      {t.sendAppLink}
    </Button>
  );
}

/**
 * Cuts a member off every device they are signed in on.
 *
 * For a lost or stolen phone. Not a ban — the next link the desk sends lets
 * them back in — but it does end every session that exists right now, which
 * is the only thing that helps once a phone is in someone else's hands.
 */
export function RevokeDevicesButton({
  memberId,
  dict,
}: {
  memberId: string;
  dict: Dictionary;
}) {
  const t = dict.reception;
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        title={t.revokeDevicesHelp}
        onClick={() => setConfirming(true)}
      >
        <ShieldOff className="size-4" />
        {t.revokeDevices}
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-destructive">{t.revokeDevicesConfirm}</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await revokeMemberDevices(memberId);
            if (res.ok) toast.success(t.revokeDevicesDone);
            else toast.error(dict.common.somethingWrong);
            setConfirming(false);
          })
        }
      >
        {dict.common.yes}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        {dict.common.no}
      </Button>
    </span>
  );
}
