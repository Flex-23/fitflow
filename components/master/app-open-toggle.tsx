"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Smartphone, Loader2 } from "lucide-react";
import { setAppGateOpenEnabled } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n";

/**
 * The experimental "open the gate from the member's page" switch. Master only,
 * shown under the gate section. Off by default; turning it off hides the
 * buttons from every member and never touches the panel's card memory.
 */
export function AppOpenToggle({
  enabled: initial,
  dict,
}: {
  enabled: boolean;
  dict: Dictionary;
}) {
  const t = dict.manager;
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      const next = !enabled;
      const res = await setAppGateOpenEnabled(next);
      if (!res.ok) {
        toast.error(dict.common.somethingWrong);
        return;
      }
      setEnabled(next);
      toast.success(next ? t.appOpenTurnedOn : t.appOpenTurnedOff);
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-brand" />
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            {t.appOpenTitle}
            <Badge variant={enabled ? "success" : "muted"}>
              {enabled ? t.gateOn : t.gateOff}
            </Badge>
          </p>
          <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{t.appOpenHelp}</p>
        </div>
      </div>

      <Button
        type="button"
        variant={enabled ? "soft-destructive" : "brand"}
        size="sm"
        onClick={toggle}
        disabled={pending}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {enabled ? t.gateTurnOff : t.gateTurnOn}
      </Button>
    </div>
  );
}
