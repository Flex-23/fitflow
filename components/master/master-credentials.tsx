"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { updateMasterCredentials } from "@/app/actions/master";
import { emptyState } from "@/lib/action-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n";

/**
 * The master's own username and password.
 *
 * Both, because the address being secret is only half of it: a name worth
 * guessing is the other half, and the owner should be able to move either
 * without asking anyone. The current password is required even though the
 * session already proves who this is — a screen left open on a desk should
 * not be enough to take the account over.
 */
export function MasterCredentials({
  username,
  dict,
}: {
  username: string;
  dict: Dictionary;
}) {
  const t = dict.master;
  const [state, action, pending] = useActionState(updateMasterCredentials, emptyState);

  useEffect(() => {
    if (state.ok) toast.success(t.credentialsSaved);
    else if (state.error === "wrong_password") toast.error(t.wrongPassword);
    else if (state.error === "username_taken") toast.error(dict.manager.usernameTaken);
    else if (state.error) toast.error(dict.common.somethingWrong);
  }, [state, t, dict]);

  return (
    <Card className="p-4">
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="master-username">{dict.auth.username}</Label>
            <Input
              id="master-username"
              name="username"
              defaultValue={username}
              autoComplete="off"
              dir="ltr"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="master-current">{t.currentPassword}</Label>
            <Input
              id="master-current"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="master-new">{t.newPassword}</Label>
            <Input
              id="master-new"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              placeholder={t.newPasswordHint}
            />
          </div>
        </div>

        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {dict.common.save}
        </Button>
      </form>
    </Card>
  );
}
