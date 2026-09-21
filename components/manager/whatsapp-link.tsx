"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Link2, Loader2, LogOut, RefreshCw, Smartphone, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  getWhatsAppStatus,
  connectWhatsApp,
  disconnectWhatsApp,
  type WaStatus,
} from "@/app/actions/whatsapp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n";

/**
 * Pairs the gym's WhatsApp number with the server by showing a QR code, the
 * same way WhatsApp Web does. Once linked, course PDFs are delivered as real
 * attachments without anyone opening WhatsApp by hand.
 */
export function WhatsAppLink({ dict, initial }: { dict: Dictionary; initial: WaStatus }) {
  const t = dict.manager;
  const [state, setState] = useState<WaStatus>(initial);
  const [qrImage, setQrImage] = useState<{ qr: string; url: string } | null>(null);
  const [pending, start] = useTransition();
  const polling = useRef(false);

  // While pairing or connecting, keep asking the server what changed.
  useEffect(() => {
    if (state.status !== "qr" && state.status !== "connecting") return;
    if (polling.current) return;
    polling.current = true;

    const id = setInterval(async () => {
      const next = await getWhatsAppStatus();
      setState(next);
      if (next.status === "connected" || next.status === "disconnected") {
        clearInterval(id);
        polling.current = false;
        if (next.status === "connected") toast.success(t.whatsappConnected);
      }
    }, 2500);

    return () => {
      clearInterval(id);
      polling.current = false;
    };
  }, [state.status, t.whatsappConnected]);

  // Render the QR payload as an image. `qr` is the cache key, so a stale image
  // is never shown for a newer payload without clearing state in the effect.
  const qr = state.qr;
  useEffect(() => {
    if (!qr) return;
    let cancelled = false;
    QRCode.toDataURL(qr, { width: 260, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrImage({ qr, url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [qr]);
  const qrImageUrl = qr && qrImage?.qr === qr ? qrImage.url : null;

  const connect = useCallback(() => {
    start(async () => {
      setState(await connectWhatsApp());
    });
  }, []);

  const unlink = useCallback(() => {
    start(async () => {
      setState(await disconnectWhatsApp());
      toast.success(t.whatsappUnlinked);
    });
  }, [t.whatsappUnlinked]);

  if (!state.enabled) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {t.whatsappOff}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusPill status={state.status} me={state.me} dict={dict} />
        <div className="flex items-center gap-2">
          {state.status === "connected" ? (
            <Button variant="soft-destructive" size="sm" onClick={unlink} disabled={pending}>
              <LogOut className="size-4" />
              {t.whatsappUnlink}
            </Button>
          ) : (
            <Button variant="brand" size="sm" onClick={connect} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {state.status === "qr" ? t.whatsappRefreshQr : t.whatsappLink}
            </Button>
          )}
        </div>
      </div>

      {state.status === "qr" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4 sm:flex-row sm:items-start">
          <div className="grid size-[260px] shrink-0 place-items-center rounded-lg bg-white p-2">
            {qrImageUrl ? (
              <Image src={qrImageUrl} alt="WhatsApp QR" width={244} height={244} unoptimized />
            ) : (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            )}
          </div>
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Smartphone className="mt-0.5 size-4 shrink-0 text-brand" />
              {t.whatsappStep1}
            </li>
            <li className="flex items-start gap-2">
              <Link2 className="mt-0.5 size-4 shrink-0 text-brand" />
              {t.whatsappStep2}
            </li>
            <li className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 size-4 shrink-0 text-brand" />
              {t.whatsappStep3}
            </li>
          </ol>
        </div>
      )}

      {state.lastError && state.status !== "connected" && (
        <p className="text-xs text-muted-foreground">
          {t.whatsappLastError}: <span dir="ltr">{state.lastError}</span>
        </p>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        {t.whatsappUnofficial}
      </p>
    </div>
  );
}

function StatusPill({
  status,
  me,
  dict,
}: {
  status: WaStatus["status"];
  me: string | null;
  dict: Dictionary;
}) {
  const t = dict.manager;
  if (status === "connected") {
    return (
      <span className="flex items-center gap-2">
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="size-3" />
          {t.whatsappConnectedShort}
        </Badge>
        {me && (
          <span className="text-sm text-muted-foreground" dir="ltr">
            +{me}
          </span>
        )}
      </span>
    );
  }
  const map = {
    qr: { variant: "warning" as const, label: t.whatsappWaitingScan },
    connecting: { variant: "secondary" as const, label: t.whatsappConnecting },
    disconnected: { variant: "muted" as const, label: t.whatsappNotLinked },
    disabled: { variant: "muted" as const, label: t.whatsappDisabled },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
