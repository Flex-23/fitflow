import { DoorOpen, PlugZap, ServerOff } from "lucide-react";
import type { GateHealth } from "@/lib/gate/worker-state";
import { formatDateTime } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

/**
 * Whether the door is actually answering, in one line.
 *
 * A gate with its cable out changes nothing else in FitFlow — members are
 * registered, courses are written, money is taken exactly as before — but the
 * page of card reads looks identical whether the turnstile is quiet or
 * unplugged. This says which, and names the one thing to go and check.
 *
 * Silent when everything is working: an all-clear on screen all day is a
 * banner people stop reading.
 */
export function GateHealthNote({
  health,
  dict,
  locale,
}: {
  health: GateHealth;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.gate;
  if (health.bridgeUp && health.panelUp) return null;

  const bridgeDown = !health.bridgeUp;
  const Icon = bridgeDown ? ServerOff : PlugZap;
  const since = bridgeDown ? health.lastSeen : health.panelOkAt;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
      <Icon className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold">
          {bridgeDown ? t.bridgeStopped : t.panelOffline}
        </p>
        <p className="text-xs text-muted-foreground">
          {bridgeDown ? t.bridgeStoppedHelp : t.panelOfflineHelp}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <DoorOpen className="size-3.5" />
          {since ? `${t.lastWorking} ${formatDateTime(since, locale)}` : t.neverConnected}
        </p>
      </div>
    </div>
  );
}
