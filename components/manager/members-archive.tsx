"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Archive,
  Phone,
  Trash2,
  RotateCw,
  AlertTriangle,
  Info,
  CalendarX2,
  Loader2,
} from "lucide-react";
import { deleteMembers } from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import type { PageInfo } from "@/lib/pagination";
import { RenewForm } from "@/components/reception/renew-form";
import type { PlanOption } from "@/components/reception/plan-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type ArchivedMember = {
  id: string;
  name: string;
  phone: string;
  lastPlanName: string | null;
  absentSince: string;
  absentDays: number;
};

export function MembersArchive({
  rows,
  plans,
  paging,
  dict,
  locale,
}: {
  rows: ArchivedMember[];
  plans: PlanOption[];
  paging: PageInfo;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.manager;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [renewing, setRenewing] = useState<ArchivedMember | null>(null);
  const [pending, start] = useTransition();

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function removeSelected() {
    start(async () => {
      const res = await deleteMembers([...selected]);
      if (res.ok) {
        toast.success(t.membersDeleted.replace("{n}", String(res.data?.count ?? selected.size)));
        setSelected(new Set());
      } else {
        toast.error(dict.common.somethingWrong);
      }
      setConfirming(false);
    });
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        {t.archiveHint}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder={dict.reception.searchMembers} />
        <div className="flex items-center gap-2">
          <Badge variant="muted" className="h-8 px-3 text-xs">
            <Archive className="size-3.5" />
            {paging.total} {dict.reception.membersCount}
          </Badge>
          {selected.size > 0 && (
            <>
              <Badge variant="brand" className="h-8 px-3 text-xs">
                {t.selectedCount.replace("{n}", String(selected.size))}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                {t.clearSelection}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" />
                {t.deleteSelected}
              </Button>
            </>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Archive} title={t.noArchived} description={t.noArchivedDesc} />
      ) : (
        <Card>
          <Table className="min-w-[48rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[5%] text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label={t.selectAll}
                    className="size-4 accent-brand"
                  />
                </TableHead>
                <TableHead className="w-[6%] text-center">#</TableHead>
                <TableHead className="w-[27%]">{dict.common.name}</TableHead>
                <TableHead className="w-[18%]">{t.lastSubscription}</TableHead>
                <TableHead className="w-[22%]">{t.absentSince}</TableHead>
                <TableHead className="w-[22%] text-end">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m, i) => {
                const checked = selected.has(m.id);
                return (
                  <TableRow
                    key={m.id}
                    // The whole row is the hit target — the checkbox is just
                    // the indicator.
                    onClick={() => toggle(m.id)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={checked}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle(m.id);
                      }
                    }}
                    className={cn(
                      "cursor-pointer select-none transition-colors",
                      checked && "bg-brand/10 hover:bg-brand/15"
                    )}
                  >
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(m.id)}
                        // The row handles the click; stop it bubbling back or
                        // the toggle would fire twice and cancel itself.
                        onClick={(e) => e.stopPropagation()}
                        aria-label={m.name}
                        className="size-4 accent-brand"
                      />
                    </TableCell>
                    <TableCell className="text-center text-xs font-semibold text-muted-foreground">
                      {paging.from + i}
                    </TableCell>
                    <TableCell>
                      <div className="truncate font-medium">{m.name}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" />
                        <span dir="ltr" className="tabular-nums">
                          {m.phone}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="truncate text-sm">
                      {m.lastPlanName ?? (
                        <span className="text-muted-foreground">{t.neverSubscribed}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="gap-1 whitespace-nowrap">
                          <CalendarX2 className="size-3" />
                          {t.absentDays.replace("{n}", String(m.absentDays))}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(m.absentSince, locale)}
                      </div>
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="soft-brand"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenewing(m);
                        }}
                      >
                        <RotateCw />
                        {dict.reception.renew}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination info={paging} locale={locale} labels={dict.common.pager} />

      {/* Bulk delete confirmation */}
      <Dialog open={confirming} onClose={() => setConfirming(false)} title={t.deleteSelected}>
        <div className="space-y-4">
          <p className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            {t.confirmDeleteSelected.replace("{n}", String(selected.size))}
          </p>
          <ul className="scroll-quiet max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {rows
              .filter((r) => selected.has(r.id))
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between px-3 py-2">
                  <span>{r.name}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {r.phone}
                  </span>
                </li>
              ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              {dict.common.cancel}
            </Button>
            <Button variant="destructive" onClick={removeSelected} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {pending ? dict.common.saving : dict.common.delete}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Renew straight from the archive */}
      <Dialog
        open={!!renewing}
        onClose={() => setRenewing(null)}
        title={dict.reception.renewTitle}
        description={dict.reception.renewDesc}
        className="max-w-lg"
      >
        {renewing && (
          <RenewForm
            key={renewing.id}
            target={{
              memberId: renewing.id,
              memberName: renewing.name,
              phone: renewing.phone,
              currentPlanName: renewing.lastPlanName,
              currentEndDate: renewing.absentSince,
            }}
            plans={plans}
            dict={dict}
            locale={locale}
            onDone={() => setRenewing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
