"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Users,
  Activity,
  X,
} from "lucide-react";
import type { ActivityAction, Role } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/manager/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { shiftGymDay, currentGymDay, GYM_DAY_START_HOUR } from "@/lib/gym-day";
import { formatDate } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

/** "03:00 → 02:59" — built as one string so it renders as a single text node. */
function dayWindowLabel(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(GYM_DAY_START_HOUR)}:00 → ${pad((GYM_DAY_START_HOUR + 23) % 24)}:59`;
}

export type ActivityRow = {
  id: string;
  userName: string;
  userRole: Role;
  action: ActivityAction;
  details: string | null;
  createdAt: string;
};

export function ActivityLog({
  rows,
  users,
  day,
  isToday,
  selectedUserId,
  selectedAction,
  dict,
  locale,
}: {
  rows: ActivityRow[];
  users: { id: string; name: string }[];
  /** YYYY-MM-DD of the gym day being viewed. */
  day: string;
  isToday: boolean;
  selectedUserId: string;
  selectedAction: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.manager;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rtl = locale === "ar";
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;

  function go(next: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  const summary = useMemo(() => {
    const byAction = new Map<ActivityAction, number>();
    const staff = new Set<string>();
    for (const r of rows) {
      byAction.set(r.action, (byAction.get(r.action) ?? 0) + 1);
      staff.add(r.userName);
    }
    const top = [...byAction.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    return { total: rows.length, staff: staff.size, top };
  }, [rows]);

  const time = (iso: string) =>
    new Intl.DateTimeFormat(rtl ? "ar-IQ-u-nu-latn" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const roleLabel = (role: Role) =>
    dict.roles[role.toLowerCase() as "manager" | "reception" | "captain"];

  return (
    <div className="space-y-4">
      {/* ── Day navigator ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          title={t.prevDay}
          aria-label={t.prevDay}
          onClick={() => go({ day: shiftGymDay(day, -1) })}
        >
          <Prev />
        </Button>
        <Input
          type="date"
          value={day}
          onChange={(e) => e.target.value && go({ day: e.target.value })}
          dir="ltr"
          className="h-9 w-44 text-center"
        />
        <Button
          variant="outline"
          size="icon-sm"
          title={t.nextDay}
          aria-label={t.nextDay}
          disabled={isToday}
          onClick={() => go({ day: shiftGymDay(day, 1) })}
        >
          <Next />
        </Button>
        {!isToday && (
          <Button variant="soft-brand" size="xs" onClick={() => go({ day: currentGymDay() })}>
            <CalendarDays />
            {t.today}
          </Button>
        )}
        <Badge variant="secondary" className="h-9 gap-1.5 px-3">
          <Clock className="size-3.5" />
          {formatDate(`${day}T12:00:00`, locale)}
          <span className="text-muted-foreground" dir="ltr">
            {dayWindowLabel()}
          </span>
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">{t.gymDayNote}</p>

      {/* ── Day summary ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Activity} label={t.totalActions} value={String(summary.total)} tone="brand" />
        <StatTile icon={Users} label={t.activeStaff} value={String(summary.staff)} tone="success" />
        <StatTile
          icon={ScrollText}
          label={t.busiestAction}
          value={summary.top ? dict.activityActions[summary.top[0]] : "—"}
          hint={summary.top ? `${summary.top[1]}` : undefined}
          tone="muted"
        />
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-52">
          <Select
            value={selectedUserId}
            onChange={(e) => go({ userId: e.target.value })}
            aria-label={t.user}
          >
            <option value="">{t.allUsers}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-64">
          <Select
            value={selectedAction}
            onChange={(e) => go({ action: e.target.value })}
            aria-label={t.action}
          >
            <option value="">{t.allActions}</option>
            {Object.entries(dict.activityActions).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        {(selectedUserId || selectedAction) && (
          <Button variant="ghost" size="sm" onClick={() => go({ userId: "", action: "" })}>
            <X className="size-4" />
            {t.filter}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={t.noActivityToday}
          description={t.noActivityTodayDesc}
        />
      ) : (
        <Card>
          <Table className="min-w-[44rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead justify="center" className="w-[6%]">#</TableHead>
                <TableHead className="w-[24%]">{t.user}</TableHead>
                <TableHead className="w-[24%]">{t.action}</TableHead>
                <TableHead className="w-[34%]">{t.details}</TableHead>
                <TableHead justify="center" className="w-[12%]">{t.when}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((log, i) => (
                <TableRow key={log.id}>
                  <TableCell justify="center" className="text-xs font-semibold text-muted-foreground">
                    {rows.length - i}
                  </TableCell>
                  <TableCell>
                    <div className="truncate font-medium">{log.userName}</div>
                    <Badge variant="muted" className="mt-0.5">
                      {roleLabel(log.userRole)}
                    </Badge>
                  </TableCell>
                  <TableCell className="truncate">{dict.activityActions[log.action]}</TableCell>
                  <TableCell className="truncate text-muted-foreground" dir="auto" title={log.details ?? ""}>
                    {log.details ?? "—"}
                  </TableCell>
                  <TableCell justify="center" className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {time(log.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
