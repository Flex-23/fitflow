"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2, CreditCard } from "lucide-react";
import { resyncGateAction, wipeGateAction } from "@/app/actions/gate-hybrid";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/**
 * Hybrid mode's own controls: how many cards the panel currently holds, and
 * the two actions a manager can ask the bridge for — resync now, or clear
 * the panel's memory and rebuild it. Both just set a flag the bridge polls
 * for; nothing here talks to the panel directly (only the bridge may).
 */
export function GateHybridCard({
  panelUsers,
  dict,
}: {
  /** From Setting "gate.panelUsers", or null if the bridge has never reconciled. */
  panelUsers: number | null;
  dict: Dictionary;
}) {
  const t = dict.gate;
  const [resyncing, startResync] = useTransition();
  const [wiping, startWipe] = useTransition();

  const resync = () =>
    startResync(async () => {
      const res = await resyncGateAction();
      toast[res.ok ? "success" : "error"](res.ok ? t.resyncQueued : dict.common.somethingWrong);
    });

  const wipe = () => {
    if (!window.confirm(t.wipePanelConfirm)) return;
    startWipe(async () => {
      const res = await wipeGateAction();
      toast[res.ok ? "success" : "error"](res.ok ? t.wipeQueued : dict.common.somethingWrong);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 size-5 shrink-0 text-brand" />
        <div>
          <p className="text-sm font-medium">{t.hybridTitle}</p>
          <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{t.hybridDesc}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{panelUsers ?? "—"}</span>{" "}
          <span className="text-muted-foreground">{t.panelUsers}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={resyncing} onClick={resync}>
            <RefreshCw className={resyncing ? "animate-spin" : undefined} />
            {t.resyncNow}
          </Button>
          <Button type="button" variant="soft-destructive" size="sm" disabled={wiping} onClick={wipe}>
            <Trash2 />
            {t.wipePanel}
          </Button>
        </div>
      </div>
    </div>
  );
}
