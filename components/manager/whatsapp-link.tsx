"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  Trash2,
  WifiOff,
} from "lucide-react";
import {
  getWhatsAppStatus,
  retryFailedSends,
  clearFailedSends,
  type WaStatus,
} from "@/app/actions/whatsapp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

/**
 * Delivery status for the gym's WhatsApp number.
 *
 * The number is paired on the gym computer by scanning a QR code the worker
 * prints in its terminal, so there is nothing to click here — this reports
 * whether that worker is running and what is waiting in the queue.
 */
export function WhatsAppLink({
  dict,
  locale,
  initial,
}: {
  dict: Dictionary;
  locale: Locale;
  initial: WaStatus;
}) {
  const t = dict.manager;
  const [state, setState] = useState<WaStatus>(initial);
  const [pending, start] = useTransition();

  // The worker reports in every 30s; follow it while the page is open.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        setState(await getWhatsAppStatus());
      } catch {
        // A failed poll is not worth a toast; the next one will tell.
      }
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  if (!state.enabled) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {t.whatsappOff}
      </p>
    );
  }

  const refresh = () =>
    start(async () => {
      setState(await getWhatsAppStatus());
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {state.number ? (
            <Badge variant={state.online ? "success" : "warning"} className="gap-1">
              {state.online ? <CheckCircle2 className="size-3" /> : <WifiOff className="size-3" />}
              {state.online ? t.whatsappConnectedShort : t.whatsappWorkerOffline}
            </Badge>
          ) : (
            <Badge variant="muted">{t.whatsappNotLinked}</Badge>
          )}
          {state.number && (
            <span className="text-sm text-muted-foreground" dir="ltr">
              +{state.number}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={pending}>
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
          {dict.common.search}
        </Button>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <Tile label={t.whatsappQueued} value={String(state.pending)} icon={Clock} />
        <Tile
          label={t.whatsappFailed}
          value={String(state.failed)}
          icon={AlertTriangle}
          tone={state.failed > 0 ? "destructive" : undefined}
        />
        <Tile
          label={t.whatsappLastSeen}
          value={state.lastSeen ? formatDate(state.lastSeen, locale) : "—"}
          icon={Send}
        />
      </div>

      {state.failed > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="soft-brand"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const { retried } = await retryFailedSends();
                toast.success(t.whatsappRetried.replace("{n}", String(retried)));
                setState(await getWhatsAppStatus());
              })
            }
          >
            <RefreshCw className="size-4" />
            {t.whatsappRetry}
          </Button>
          <Button
            variant="soft-destructive"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await clearFailedSends();
                setState(await getWhatsAppStatus());
              })
            }
          >
            <Trash2 className="size-4" />
            {t.whatsappClearFailed}
          </Button>
        </div>
      )}

      {!state.online && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          {state.number ? t.whatsappWorkerOfflineHelp : t.whatsappPairHelp}
        </p>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        {t.whatsappUnofficial}
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "destructive";
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p
        className={
          tone === "destructive" ? "font-semibold text-destructive" : "font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}
