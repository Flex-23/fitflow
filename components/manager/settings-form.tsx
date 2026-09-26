"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import { updateSettings } from "@/app/actions/settings";
import { emptyState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/lib/i18n";

export function SettingsForm({
  threshold,
  courseAuthorName,
  dict,
}: {
  threshold: number;
  courseAuthorName: string;
  dict: Dictionary;
}) {
  const t = dict.manager;
  const [state, action, pending] = useActionState(updateSettings, emptyState);

  useEffect(() => {
    if (state.ok) toast.success(t.settingsSaved);
    else if (state.error) toast.error(dict.common.somethingWrong);
  }, [state, t.settingsSaved, dict.common.somethingWrong]);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="expiringThreshold">{t.expiringThreshold}</Label>
        <Input
          id="expiringThreshold"
          name="expiringThreshold"
          type="number"
          min={0}
          max={60}
          defaultValue={threshold}
          className="max-w-32"
          required
        />
        <p className="text-xs text-muted-foreground">{t.expiringThresholdDesc}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="courseAuthorName">{t.courseAuthorLabel}</Label>
        <Input
          id="courseAuthorName"
          name="courseAuthorName"
          maxLength={60}
          defaultValue={courseAuthorName}
          placeholder={t.courseAuthorPlaceholder}
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">{t.courseAuthorDesc}</p>
      </div>
      <Button type="submit" variant="brand" disabled={pending}>
        {pending ? dict.common.saving : dict.common.save}
      </Button>
    </form>
  );
}
