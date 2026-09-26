"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import type { Section } from "@prisma/client";

import { setManagerSections } from "@/app/actions/master";
import { ALL_SECTIONS } from "@/lib/auth/rbac";
import type { Role } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/** One staff account, as the master screen lists it. */
export type StaffRow = {
  id: string;
  displayName: string;
  username: string;
  role: Role;
  isActive: boolean;
  canAddVideos: boolean;
  sections: Section[];
  createdAt: string;
  isSelf: boolean;
};

/**
 * What each manager may open, as a row of switches per manager.
 *
 * Changes are held until "save" rather than fired per tick: revoking four
 * sections should be one decision and one entry in the activity log, not
 * four — and a half-applied set is a manager locked out of their own screen
 * mid-edit.
 */
export function PermissionsGrid({
  managers,
  dict,
  locale,
}: {
  managers: StaffRow[];
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.master;

  if (managers.length === 0) {
    return (
      <EmptyState icon={ShieldCheck} title={t.noManagers} description={t.noManagersHelp} />
    );
  }

  return (
    <div className="space-y-3">
      {managers.map((m) => (
        <ManagerRow key={m.id} manager={m} dict={dict} locale={locale} />
      ))}
    </div>
  );
}

function ManagerRow({
  manager,
  dict,
  locale,
}: {
  manager: StaffRow;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.master;
  const [granted, setGranted] = useState<Section[]>(manager.sections);
  const [pending, start] = useTransition();

  const held = new Set(granted);
  const original = new Set(manager.sections);
  const dirty =
    granted.length !== manager.sections.length || granted.some((s) => !original.has(s));

  const toggle = (section: Section) =>
    setGranted((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );

  const save = () =>
    start(async () => {
      const res = await setManagerSections(manager.id, granted);
      if (res.ok) toast.success(t.permissionsSaved.replace("{name}", manager.displayName));
      else toast.error(dict.common.somethingWrong);
    });

  return (
    <Card className={cn("p-4", !manager.isActive && "opacity-60")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{manager.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground" dir="ltr">
            {manager.username} · {formatDate(manager.createdAt, locale)}
          </span>
        </span>
        {!manager.isActive && <Badge variant="muted">{dict.manager.inactiveAccount}</Badge>}
        {granted.length === 0 && <Badge variant="destructive">{t.noAccess}</Badge>}
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_SECTIONS.map((section) => {
          const on = held.has(section);
          return (
            <button
              key={section}
              type="button"
              onClick={() => toggle(section)}
              disabled={pending}
              aria-pressed={on}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                on
                  ? "border-brand/40 bg-brand/15 text-brand"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {on && <Check className="size-3.5" />}
              {dict.sections[section.toLowerCase() as "reception"]}
            </button>
          );
        })}
      </div>

      {dirty && (
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" variant="brand" size="sm" onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {dict.common.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setGranted(manager.sections)}
          >
            {dict.common.cancel}
          </Button>
        </div>
      )}
    </Card>
  );
}
