"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DoorOpen, LogIn, LogOut, Loader2, Check } from "lucide-react";
import { requestGateOpen, type GateOpenResult } from "@/app/actions/gate-open";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/**
 * The member taps "enter" or "exit" and the gate bridge opens the door. The
 * server enforces the rules (active subscription, daily limit); this only
 * reports what happened.
 */
export function GateOpen({ dict }: { dict: Dictionary }) {
  const t = dict.portal;
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [doneAt, setDoneAt] = useState<"in" | "out" | null>(null);

  const message = (r: GateOpenResult): string => {
    if (r.ok) return t.gateOpening;
    switch (r.reason) {
      case "not_active":
        return t.gateNotActive;
      case "too_many":
        return t.gateTooMany;
      case "locked":
        return t.gateLocked;
      case "no_session":
      case "off":
      case "error":
      default:
        return dict.common.somethingWrong;
    }
  };

  const open = (direction: "in" | "out") =>
    start(async () => {
      setBusy(direction);
      const res = await requestGateOpen(direction);
      setBusy(null);
      if (res.ok) {
        setDoneAt(direction);
        toast.success(t.gateOpening);
        setTimeout(() => setDoneAt(null), 4000);
      } else {
        toast.error(message(res));
      }
    });

  return (
    <div className="rounded-2xl border border-white/10 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <DoorOpen className="size-4 text-brand" />
        <p className="text-sm font-semibold">{t.gateTitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="brand"
          size="lg"
          onClick={() => open("in")}
          disabled={pending}
        >
          {busy === "in" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : doneAt === "in" ? (
            <Check className="size-5" />
          ) : (
            <LogIn className="size-5" />
          )}
          {t.gateEnter}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => open("out")}
          disabled={pending}
        >
          {busy === "out" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : doneAt === "out" ? (
            <Check className="size-5" />
          ) : (
            <LogOut className="size-5" />
          )}
          {t.gateExit}
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">{t.gateHint}</p>
    </div>
  );
}
