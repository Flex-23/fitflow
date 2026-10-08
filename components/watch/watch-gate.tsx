"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlayCircle, ShieldCheck, Clock } from "lucide-react";
import { requestVideoAccess } from "@/app/actions/watch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/lib/i18n";

/** Phone check shown when the visitor has no open watch session. */
export function WatchGate({
  token,
  exerciseName,
  dict,
}: {
  token: string;
  exerciseName: string;
  dict: Dictionary;
}) {
  const t = dict.watch;
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await requestVideoAccess(token, phone);
      if (res.ok) {
        toast.success(t.verified);
        // The session cookie is set — re-render the page as a signed-in watcher.
        router.refresh();
      } else if (res.lockedMinutes) {
        toast.error(t.tooManyTries.replace("{n}", String(res.lockedMinutes)));
      } else {
        toast.error(t.denied);
      }
    });
  }

  return (
    <div className="w-full space-y-5">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{t.title}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{exerciseName}</h1>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="space-y-2">
          <Label htmlFor="phone">{t.enterPhone}</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
            required
            autoFocus
            placeholder={t.phone}
            className="h-12 text-center text-lg tracking-wide"
          />
        </div>

        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
          <PlayCircle className="size-5" />
          {pending ? t.checking : t.watch}
        </Button>

        <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            {t.secured}
          </p>
          <p className="flex items-center justify-center gap-1.5 text-center">
            <Clock className="size-3.5 shrink-0" />
            {t.sessionNote}
          </p>
        </div>
      </form>
    </div>
  );
}
