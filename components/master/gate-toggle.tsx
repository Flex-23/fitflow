"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DoorOpen, Loader2 } from "lucide-react";
import { setGateEnabled } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n";

/**
 * Does this gym have a turnstile?
 *
 * Only the master sees this, because the answer decides what everyone else
 * sees: with no gate there is no gate page and no card number on the
 * registration form. Both come back the moment it is switched on, and no
 * card already on file is touched either way.
 */
export function GateToggle({
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
      const res = await setGateEnabled(next);
      if (!res.ok) {
        toast.error(dict.common.somethingWrong);
        return;
      }
      setEnabled(next);
      toast.success(next ? t.gateTurnedOn : t.gateTurnedOff);
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <DoorOpen className="mt-0.5 size-5 shrink-0 text-brand" />
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            {dict.nav.gate}
            <Badge variant={enabled ? "success" : "muted"}>
              {enabled ? t.gateOn : t.gateOff}
            </Badge>
          </p>
          <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{t.gateToggleHelp}</p>
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
