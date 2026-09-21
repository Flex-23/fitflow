"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Wallet,
  Receipt,
  UserPlus,
  BadgeCheck,
  HandCoins,
  CalendarClock,
  ChevronsLeftRight,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayDetailDialog } from "@/components/manager/day-detail-dialog";
import type { Report } from "@/lib/reports";
import { percentChange } from "@/lib/money";
import { StatTile } from "@/components/manager/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatNumber } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export function ReportsView({
  report,
  previous,
  outstanding,
  mode,
  selectedDay,
  selectedMonth,
  dict,
  locale,
}: {
  report: Report;
  previous: Report;
  outstanding: { deferred: number; debts: number };
  mode: "daily" | "monthly";
  selectedDay: string;
  selectedMonth: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.finance;
  const router = useRouter();
  const params = useSearchParams();
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);
  const num = (n: number) => formatNumber(n, locale);

  function go(next: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) p.set(k, v);
    router.push(`/reports?${p.toString()}`);
  }

  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const hasMovement = report.hasMovement;
  // Three distinct outcomes — profit, loss, and "nothing happened" — so a
  // quiet day never reads as a zero profit.
  const outcome: "profit" | "loss" | "even" = !hasMovement
    ? "even"
    : report.net > 0
      ? "profit"
      : report.net < 0
        ? "loss"
        : "even";

  return (
    <div className="space-y-5">
      {/* ── Period picker ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {(["daily", "monthly"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => go({ mode: m })}
              className={cn(
                "h-9 rounded-lg px-4 text-sm font-medium transition-colors",
                mode === m
                  ? "bg-brand/15 text-brand"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {m === "daily" ? t.daily : t.monthly}
            </button>
          ))}
        </div>

        {mode === "daily" ? (
          <Input
            type="date"
            value={selectedDay}
            onChange={(e) => go({ mode: "daily", day: e.target.value })}
            dir="ltr"
            className="h-9 w-44"
            aria-label={t.pickDay}
          />
        ) : (
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => go({ mode: "monthly", month: e.target.value })}
            dir="ltr"
            className="h-9 w-44"
            aria-label={t.pickMonth}
          />
        )}

        <Badge variant="secondary" className="h-9 px-3">
          <CalendarClock className="size-3.5" />
          {mode === "daily"
            ? formatDate(report.from, locale)
            : `${formatDate(report.from, locale)} → ${formatDate(report.to, locale)}`}
        </Badge>

        <Button asChild variant="outline" className="ms-auto">
          <a
            href={`/api/reports/pdf?mode=${mode}&day=${selectedDay}&month=${selectedMonth}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileDown className="size-4" />
            {t.exportPdf}
          </a>
        </Button>
      </div>

      {/* ── The bottom line ── */}
      <NetPanel
        outcome={outcome}
        report={report}
        previous={previous}
        mode={mode}
        dict={dict}
        locale={locale}
      />

      {/* ── Supporting figures ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={TrendingUp}
          label={t.totalIncome}
          value={money(report.totalIncome)}
          hint={changeHint(report.totalIncome, previous.totalIncome, t, mode, locale)}
          tone="success"
        />
        <StatTile
          icon={TrendingDown}
          label={t.totalExpenses}
          value={money(report.expenses)}
          hint={changeHint(report.expenses, previous.expenses, t, mode, locale)}
          tone="destructive"
        />
        <StatTile
          icon={Receipt}
          label={t.movements}
          value={num(report.paymentsCount + report.debtPaymentsCount + report.expensesCount)}
          hint={`${num(report.paymentsCount + report.debtPaymentsCount)} ${t.payments}`}
          tone="muted"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Income breakdown ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-5 text-success" />
              {t.income}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Line label={t.subscriptionIncome} value={money(report.subscriptionIncome)} tone="success" />
            <Line label={t.debtIncome} value={money(report.debtIncome)} tone="success" />
            <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
              <span className="font-medium">{t.totalIncome}</span>
              <span className="text-base font-bold text-success">{money(report.totalIncome)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Mini icon={UserPlus} label={t.newMembers} value={num(report.newMembers)} />
              <Mini icon={BadgeCheck} label={t.newSubscriptions} value={num(report.newSubscriptions)} />
            </div>
          </CardContent>
        </Card>

        {/* ── Expenses by category ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="size-5 text-destructive" />
              {t.byCategory}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {report.byCategory.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground">—</p>
            ) : (
              report.byCategory.map((c) => {
                const pct = report.expenses > 0 ? (c.total / report.expenses) * 100 : 0;
                return (
                  <div key={c.category} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span>{t.categories[c.category]}</span>
                      <span className="font-semibold">{money(c.total)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-destructive/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Still owed ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HandCoins className="size-5 text-warning" />
            {t.stillOwed}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Mini icon={Wallet} label={t.deferredOutstanding} value={money(outstanding.deferred)} />
          <Mini icon={HandCoins} label={t.debtsOutstanding} value={money(outstanding.debts)} />
          <Mini
            icon={HandCoins}
            label={t.stillOwed}
            value={money(outstanding.deferred + outstanding.debts)}
            strong
          />
        </CardContent>
      </Card>

      {/* ── Day by day (monthly only) ── */}
      {mode === "monthly" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {t.dayByDay}
              <span className="text-xs font-normal text-muted-foreground">
                {t.clickDayHint}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[32rem] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[34%]">{t.date}</TableHead>
                  <TableHead className="w-[22%]">{t.income}</TableHead>
                  <TableHead className="w-[22%]">{t.totalExpenses}</TableHead>
                  <TableHead className="w-[22%]">{t.net}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.days
                  .filter((d) => d.income > 0 || d.expenses > 0)
                  .map((d) => (
                    <TableRow
                      key={d.date}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDayDetail(d.date)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDayDetail(d.date);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <ChevronsLeftRight className="size-3.5 text-muted-foreground" />
                          {formatDate(`${d.date}T12:00:00`, locale)}
                        </span>
                      </TableCell>
                      <TableCell className="text-success">{money(d.income)}</TableCell>
                      <TableCell className="text-destructive">{money(d.expenses)}</TableCell>
                      <TableCell
                        className={cn("font-semibold", d.net >= 0 ? "text-success" : "text-warning")}
                      >
                        {money(d.net)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            {report.days.every((d) => d.income === 0 && d.expenses === 0) && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t.noMovement}</p>
            )}
          </CardContent>
        </Card>
      )}

      <DayDetailDialog
        date={dayDetail}
        onClose={() => setDayDetail(null)}
        dict={dict}
        locale={locale}
      />
    </div>
  );
}

/** "vs yesterday +12%" — omitted when the previous period had nothing. */
function changeHint(
  current: number,
  prev: number,
  t: Dictionary["finance"],
  mode: "daily" | "monthly",
  locale: Locale
): string | undefined {
  const pct = percentChange(current, prev);
  if (pct === null) return undefined;
  const label = mode === "daily" ? t.vsPrevDay : t.vsPrevMonth;
  const sign = pct > 0 ? "+" : "";
  return `${label} ${sign}${formatNumber(Math.round(pct), locale)}%`;
}

/**
 * The headline: profit, loss, or nothing at all — colour-coded so a manager
 * can read the period at a glance.
 */
function NetPanel({
  outcome,
  report,
  previous,
  mode,
  dict,
  locale,
}: {
  outcome: "profit" | "loss" | "even";
  report: Report;
  previous: Report;
  mode: "daily" | "monthly";
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.finance;
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);

  const skin = {
    profit: {
      wrap: "border-success/40 bg-success/10",
      badge: "bg-success/20 text-success",
      value: "text-success",
      Icon: TrendingUp,
      label: t.netProfit,
      hint: t.profitHint,
    },
    loss: {
      wrap: "border-destructive/40 bg-destructive/10",
      badge: "bg-destructive/20 text-destructive",
      value: "text-destructive",
      Icon: TrendingDown,
      label: t.netLoss,
      hint: t.lossHint,
    },
    even: {
      wrap: "border-border bg-card",
      badge: "bg-muted text-muted-foreground",
      value: "text-muted-foreground",
      Icon: Minus,
      label: report.hasMovement ? t.breakEven : t.noNet,
      hint: report.hasMovement ? "" : t.noMovement,
    },
  }[outcome];

  const netChange = changeHint(report.net, previous.net, t, mode, locale);
  const ratio = report.margin;

  return (
    <Card className={cn("border-2 p-5", skin.wrap)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl", skin.badge)}>
            <skin.Icon className="size-7" />
          </span>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{skin.label}</p>
            <p className={cn("text-3xl font-bold tracking-tight", skin.value)}>
              {outcome === "loss" && "− "}
              {outcome === "profit" && "+ "}
              {money(Math.abs(report.net))}
            </p>
            {skin.hint && <p className="mt-0.5 text-xs text-muted-foreground">{skin.hint}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {ratio !== null && (
            <div className="rounded-lg bg-background/60 px-3 py-2 text-center">
              <p className="text-[11px] text-muted-foreground">
                {report.net >= 0 ? t.profitMargin : t.lossRatio}
              </p>
              <p className={cn("font-bold", skin.value)}>
                {formatNumber(Math.abs(Math.round(ratio)), locale)}%
              </p>
            </div>
          )}
          <div className="rounded-lg bg-background/60 px-3 py-2 text-center">
            <p className="text-[11px] text-muted-foreground">{t.prevPeriod}</p>
            <p className="font-semibold">
              {previous.hasMovement ? money(previous.net) : "—"}
            </p>
          </div>
          {netChange && (
            <div className="rounded-lg bg-background/60 px-3 py-2 text-center">
              <p className="text-[11px] text-muted-foreground">
                {mode === "daily" ? t.vsPrevDay : t.vsPrevMonth}
              </p>
              <p className={cn("font-semibold", report.net >= previous.net ? "text-success" : "text-destructive")}>
                {netChange.replace(mode === "daily" ? t.vsPrevDay : t.vsPrevMonth, "").trim()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Income vs expenses bar — instantly shows which side is bigger. */}
      {report.hasMovement && (
        <div className="mt-4 space-y-1.5">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="bg-success transition-all"
              style={{
                width: `${percentOf(report.totalIncome, report.totalIncome + report.expenses)}%`,
              }}
            />
            <div
              className="bg-destructive transition-all"
              style={{
                width: `${percentOf(report.expenses, report.totalIncome + report.expenses)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-success">
              {t.income}: {money(report.totalIncome)}
            </span>
            <span className="text-destructive">
              {t.totalExpenses}: {money(report.expenses)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function percentOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Mini({
  icon: Icon,
  label,
  value,
  strong,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={cn("rounded-lg px-3 py-2", strong ? "bg-brand/10" : "bg-muted/50")}>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className={cn("mt-0.5 font-bold", strong ? "text-brand" : "")}>{value}</p>
    </div>
  );
}
