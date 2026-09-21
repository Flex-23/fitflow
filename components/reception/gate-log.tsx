"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  DoorOpen,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  LogIn,
  Ban,
  Users,
  IdCard,
} from "lucide-react";
import { Card } from "@/components/ui/card";
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
import { shiftGymDay, currentGymDay } from "@/lib/gym-day";
import { formatDate } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type GateRow = {
  id: string;
  memberId: string | null;
  memberName: string | null;
  memberPhone: string | null;
  card: string;
  door: number;
  allowed: boolean;
  reason: string | null;
  createdAt: string;
};

/** Rows are written by the bridge process; today's view re-fetches this often. */
const LIVE_REFRESH_MS = 5000;

export function GateLog({
  rows,
  day,
  isToday,
  dict,
  locale,
}: {
  rows: GateRow[];
  /** YYYY-MM-DD of the gym day being viewed. */
  day: string;
  isToday: boolean;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.gate;
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

  // Keep today's list moving without a manual reload — the desk watches it
  // while people tap in.
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => router.refresh(), LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [isToday, router]);

  const summary = useMemo(() => {
    const members = new Set<string>();
    let allowed = 0;
    for (const r of rows) {
      if (r.allowed) {
        allowed++;
        if (r.memberId) members.add(r.memberId);
      }
    }
    return { allowed, denied: rows.length - allowed, members: members.size };
  }, [rows]);

  const time = (iso: string) =>
    new Intl.DateTimeFormat(rtl ? "ar-IQ-u-nu-latn" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));

  const reasonLabel = (reason: string | null) =>
    reason && reason in t.reason ? t.reason[reason as keyof typeof t.reason] : reason ?? "";

  return (
    <div className="space-y-4">
      {/* ── Day navigator ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          title={dict.manager.prevDay}
          aria-label={dict.manager.prevDay}
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
          title={dict.manager.nextDay}
          aria-label={dict.manager.nextDay}
          disabled={isToday}
          onClick={() => go({ day: shiftGymDay(day, 1) })}
        >
          <Next />
        </Button>
        {!isToday && (
          <Button variant="soft-brand" size="xs" onClick={() => go({ day: currentGymDay() })}>
            <CalendarDays />
            {dict.manager.today}
          </Button>
        )}
        <Badge variant="secondary" className="h-9 gap-1.5 px-3">
          <Clock className="size-3.5" />
          {formatDate(`${day}T12:00:00`, locale)}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">{t.bridgeNote}</p>

      {/* ── Day summary ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={LogIn} label={t.entries} value={String(summary.allowed)} tone="success" />
        <StatTile
          icon={Ban}
          label={t.denied}
          value={String(summary.denied)}
          tone={summary.denied > 0 ? "destructive" : "muted"}
        />
        <StatTile icon={Users} label={t.uniqueMembers} value={String(summary.members)} tone="brand" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={DoorOpen} title={t.noEvents} description={t.noEventsDesc} />
      ) : (
        <Card>
          <Table className="min-w-[40rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[6%] text-center">#</TableHead>
                <TableHead className="w-[30%]">{t.member}</TableHead>
                <TableHead className="w-[16%]">{t.card}</TableHead>
                <TableHead className="w-[8%] text-center">{t.door}</TableHead>
                <TableHead className="w-[28%]">{t.result}</TableHead>
                <TableHead className="w-[12%]">{t.when}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="text-center text-xs font-semibold text-muted-foreground">
                    {rows.length - i}
                  </TableCell>
                  <TableCell>
                    {r.memberName ? (
                      <>
                        <div className="truncate font-medium">{r.memberName}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">
                          {r.memberPhone}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t.unknownCard}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground" dir="ltr">
                      <IdCard className="size-3.5" />
                      {r.card}
                    </span>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{r.door}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.allowed ? "success" : "destructive"}>
                        {r.allowed ? t.allowed : t.refused}
                      </Badge>
                      {!r.allowed && (
                        <span className={cn("truncate text-xs text-muted-foreground")} title={reasonLabel(r.reason)}>
                          {reasonLabel(r.reason)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {time(r.createdAt)}
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
