"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { toast } from "sonner";
import {
  Snowflake,
  Ban,
  Play,
  BadgeCheck,
  Phone,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import {
  freezeSubscription,
  cancelSubscription,
  unfreezeSubscription,
} from "@/app/actions/subscriptions";
import { emptyState } from "@/lib/action-state";
import { FREEZE_MIN_DAYS_LEFT } from "@/schemas/subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { StatusBadge } from "@/components/reception/status-badge";
import { FilterChips, type FilterChip } from "@/components/reception/filter-chips";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, daysUntil } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export type ActiveRow = {
  id: string;
  memberName: string;
  phone: string;
  planName: string;
  method: "CASH" | "DEFERRED";
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "FROZEN";
  freezeUntil: string | null;
};

type Filter = "all" | "active" | "frozen" | "soon";

export function ActiveSubscriptions({
  rows,
  dict,
  locale,
  threshold,
}: {
  rows: ActiveRow[];
  dict: Dictionary;
  locale: Locale;
  threshold: number;
}) {
  const t = dict.reception;
  const [selected, setSelected] = useState<ActiveRow | null>(null);
  const [mode, setMode] = useState<"freeze" | "cancel" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [now] = useState(() => Date.now());

  // Queued by an early renewal — starts after the member's current one ends.
  const isUpcoming = (r: ActiveRow) => new Date(r.startDate).getTime() > now;
  const isSoon = (r: ActiveRow) =>
    r.status === "ACTIVE" && !isUpcoming(r) && daysUntil(r.endDate) <= threshold;

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      frozen: rows.filter((r) => r.status === "FROZEN").length,
      soon: rows.filter(isSoon).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, threshold]
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "active":
        return rows.filter((r) => r.status === "ACTIVE");
      case "frozen":
        return rows.filter((r) => r.status === "FROZEN");
      case "soon":
        return rows.filter(isSoon);
      default:
        return rows;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, threshold]);

  const chips: FilterChip<Filter>[] = [
    { key: "all", label: dict.common.all, count: counts.all },
    { key: "active", label: dict.status.active, count: counts.active, tone: "success" },
    { key: "soon", label: t.expiringSoon, count: counts.soon, tone: "warning" },
    { key: "frozen", label: dict.status.frozen, count: counts.frozen, tone: "default" },
  ];

  function open(row: ActiveRow, m: "freeze" | "cancel") {
    setSelected(row);
    setMode(m);
  }
  function close() {
    setMode(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder={t.searchMembers} />
        <FilterChips chips={chips} value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={BadgeCheck} title={t.noActive} description={t.noActiveDesc} />
      ) : (
        <Card>
          <Table className="min-w-[56rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead justify="center" className="w-[5%]">
                  #
                </TableHead>
                <TableHead className="w-[22%]">{t.member}</TableHead>
                <TableHead className="w-[12%]">{t.selectPlan}</TableHead>
                <TableHead justify="center" className="w-[18%]">
                  {t.period}
                </TableHead>
                <TableHead justify="center" className="w-[12%]">
                  {t.daysLeft}
                </TableHead>
                <TableHead justify="center" className="w-[13%]">
                  {dict.common.status}
                </TableHead>
                <TableHead justify="end" className="w-[18%]">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r, i) => {
                const left = daysUntil(r.endDate);
                const soon = isSoon(r);
                const upcoming = isUpcoming(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell
                      justify="center"
                      className="text-xs font-semibold tabular-nums text-muted-foreground"
                    >
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="truncate font-medium">{r.memberName}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" />
                        <span dir="ltr" className="tabular-nums">{r.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="truncate font-medium">{r.planName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.method === "CASH" ? dict.method.cash : dict.method.deferred}
                      </div>
                    </TableCell>
                    {/* One line, start to end, reading left to right like the
                        numbers it is made of. Stacked, the two dates were a
                        second two-line cell in a row that already had two,
                        and neither said which was which. */}
                    <TableCell justify="center" className="whitespace-nowrap">
                      <div
                        className="flex items-center justify-center gap-1.5 text-sm tabular-nums"
                        dir="ltr"
                      >
                        <span className="text-muted-foreground">
                          {formatDate(r.startDate, locale)}
                        </span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                        <span className={soon ? "font-medium text-warning" : "font-medium"}>
                          {formatDate(r.endDate, locale)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell justify="center">
                      {upcoming ? (
                        <Badge variant="muted" className="gap-1.5 px-2.5 py-1 text-xs">
                          <CalendarClock className="size-3.5" />
                          {t.startsIn.replace("{n}", String(daysUntil(r.startDate)))}
                        </Badge>
                      ) : (
                        <DaysLeft days={left} soon={soon} unit={dict.common.days} />
                      )}
                    </TableCell>
                    <TableCell justify="center">
                      <div className="flex items-center justify-center gap-1.5">
                        <StatusBadge status={r.status} dict={dict} />
                        {upcoming && <Badge variant="brand">{t.upcoming}</Badge>}
                      </div>
                      {r.status === "FROZEN" && r.freezeUntil && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t.frozenUntil} {formatDate(r.freezeUntil, locale)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell justify="end">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === "FROZEN" ? (
                          <UnfreezeButton id={r.id} label={t.unfreeze} />
                        ) : (
                          // Offered only while it can succeed: running now,
                          // with enough days left. Otherwise it stays visible
                          // but disabled, and says why on hover.
                          <Button
                            variant="soft-brand"
                            size="xs"
                            disabled={upcoming || left < FREEZE_MIN_DAYS_LEFT}
                            title={
                              upcoming
                                ? t.freezeNotActive
                                : left < FREEZE_MIN_DAYS_LEFT
                                  ? t.freezeTooClose.replace("{n}", String(FREEZE_MIN_DAYS_LEFT))
                                  : undefined
                            }
                            onClick={() => open(r, "freeze")}
                          >
                            <Snowflake />
                            {t.freeze}
                          </Button>
                        )}
                        <Button variant="soft-destructive" size="xs" onClick={() => open(r, "cancel")}>
                          <Ban />
                          {t.cancelSub}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={mode === "freeze"}
        onClose={close}
        title={t.freezeTitle}
        description={t.freezeDesc}
      >
        {selected && (
          <FreezeForm key={selected.id} row={selected} dict={dict} locale={locale} onDone={close} />
        )}
      </Dialog>

      <Dialog
        open={mode === "cancel"}
        onClose={close}
        title={t.cancelTitle}
        description={t.cancelDesc}
      >
        {selected && (
          <CancelForm key={selected.id} row={selected} dict={dict} onDone={close} />
        )}
      </Dialog>
    </div>
  );
}

function DaysLeft({ days, soon, unit }: { days: number; soon: boolean; unit: string }) {
  const variant = days < 0 ? "destructive" : soon ? "warning" : "success";
  return (
    <Badge variant={variant} className="gap-1.5 px-2.5 py-1 text-xs font-semibold">
      <CalendarClock className="size-3.5" />
      {days} {unit}
    </Badge>
  );
}

function UnfreezeButton({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="soft-success"
      size="xs"
      disabled={pending}
      onClick={() => start(() => unfreezeSubscription(id))}
    >
      <Play />
      {label}
    </Button>
  );
}

function MemberChip({ row, dict, locale }: { row: ActiveRow; dict: Dictionary; locale: Locale }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
      <div>
        <p className="font-medium">{row.memberName}</p>
        <p className="text-xs text-muted-foreground">{row.planName}</p>
      </div>
      <div className="text-end text-xs text-muted-foreground">
        <p>{dict.reception.expiresOn}</p>
        <p className="font-medium text-foreground">{formatDate(row.endDate, locale)}</p>
      </div>
    </div>
  );
}

function FreezeForm({
  row,
  dict,
  locale,
  onDone,
}: {
  row: ActiveRow;
  dict: Dictionary;
  locale: Locale;
  onDone: () => void;
}) {
  const t = dict.reception;
  const [state, action, pending] = useActionState(freezeSubscription, emptyState);
  useEffect(() => {
    if (state.ok) {
      toast.success(dict.status.frozen);
      onDone();
    } else if (state.error === "not_active") {
      toast.error(t.freezeNotActive);
    } else if (state.error === "too_close") {
      toast.error(t.freezeTooClose.replace("{n}", String(FREEZE_MIN_DAYS_LEFT)));
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, dict, t]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="subscriptionId" value={row.id} />
      <MemberChip row={row} dict={dict} locale={locale} />
      <div className="space-y-2">
        <Label htmlFor="days">{t.freezeDays}</Label>
        <Input id="days" name="days" type="number" min={1} max={365} required autoFocus dir="ltr" className="text-start" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">{t.freezeReason}</Label>
        <Textarea id="reason" name="reason" required rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.cancel}
        </Button>
        <Button type="submit" variant="brand" disabled={pending}>
          <Snowflake className="size-4" />
          {pending ? dict.common.saving : t.freezeCta}
        </Button>
      </div>
    </form>
  );
}

function CancelForm({
  row,
  dict,
  onDone,
}: {
  row: ActiveRow;
  dict: Dictionary;
  onDone: () => void;
}) {
  const t = dict.reception;
  const [state, action, pending] = useActionState(cancelSubscription, emptyState);
  useEffect(() => {
    if (state.ok) {
      toast.success(dict.status.cancelled);
      onDone();
    } else if (state.error) {
      toast.error(dict.common.somethingWrong);
    }
  }, [state, onDone, dict]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="subscriptionId" value={row.id} />
      <p className="rounded-lg bg-destructive/10 p-3 text-sm">
        <span className="font-medium">{row.memberName}</span> — {row.planName}
      </p>
      <div className="space-y-2">
        <Label htmlFor="reason">{t.cancelReason}</Label>
        <Textarea id="reason" name="reason" rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          {dict.common.back}
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          <Ban className="size-4" />
          {pending ? dict.common.saving : t.cancelCta}
        </Button>
      </div>
    </form>
  );
}
