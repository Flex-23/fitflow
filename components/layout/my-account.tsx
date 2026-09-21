"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { changeOwnPassword } from "@/app/actions/accounts";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import type { Dictionary } from "@/lib/i18n";

/** Sidebar entry that lets any signed-in user change their own password. */
export function MyAccount({ dict, displayName }: { dict: Dictionary; displayName: string }) {
  const t = dict.manager;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <KeyRound className="size-4" />
        {t.changePassword}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={t.myAccount} description={displayName}>
        <PasswordForm key={String(open)} dict={dict} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function PasswordForm({ dict, onDone }: { dict: Dictionary; onDone: () => void }) {
  const t = dict.manager;
  const [state, action, pending] = useActionState(changeOwnPassword, emptyState);

  useEffect(() => {
    if (state.ok) {
      toast.success(t.passwordChanged);
      onDone();
    } else if (state.error === "wrong_password") {
      toast.error(t.wrongPassword);
    } else if (state.error === "invalid" && state.fieldErrors?.confirm) {
      toast.error(t.passwordsMismatch);
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, t, dict.common.somethingWrong]);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t.currentPassword}</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">{t.newPasswordLabel}</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t.confirmPassword}</Label>
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
        {state.fieldErrors?.confirm && (
          <p className="text-xs text-destructive">{t.passwordsMismatch}</p>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          <KeyRound className="size-4" />
          {pending ? dict.common.saving : dict.common.save}
        </Button>
      </div>
    </form>
  );
}
