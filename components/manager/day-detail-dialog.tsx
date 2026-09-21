"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Loader2,
  BadgeCheck,
  HandCoins,
  Receipt,
} from "lucide-react";
import { getDayDetail, type DayDetail } from "@/app/actions/reports";
import type { Movement } from "@/lib/reports";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const kindStyle: Record<
  Movement["kind"],
  { icon: typeof BadgeCheck; tone: string; badge: "success" | "brand" | "destructive" }
> = {
  subscription: { icon: BadgeCheck, tone: "text-success", badge: "success" },
  debt: { icon: HandCoins, tone: "text-success", badge: "brand" },
  expense: { icon: Receipt, tone: "text-destructive", badge: "destructive" },
};

/** Drill-down for one day of the monthly report. */
export function DayDetailDialog({
  date,
  onClose,
  dict,
  locale,
}: {
  /** YYYY-MM-DD, or null when closed. */
  date: string | null;
  onClose: () => void;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.finance;
  // Cached by date, so a stale response can never be shown for a newer day
  // and nothing has to be cleared synchronously inside the effect.
  const [cache, setCache] = useState<{ date: string; detail: DayDetail } | null>(null);
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    getDayDetail(date)
      .then((d) => {
        if (!cancelled) setCache({ date, detail: d });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [date]);

  const detail = date && cache?.date === date ? cache.detail : null;
  const loading = !!date && !detail;

  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const label: Record<Movement["kind"], string> = {
    subscription: t.subscriptionPayment,
    debt: t.debtPayment,
    expense: t.expenseMovement,
  };

  return (
    <Dialog
      open={!!date}
      onClose={onClose}
      title={t.dayDetails}
      description={date ? formatDate(`${date}T12:00:00`, locale) : undefined}
      className="max-w-2xl"
    >
      {loading && (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {detail && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Figure icon={TrendingUp} label={t.income} value={money(detail.income)} tone="text-success" />
            <Figure
              icon={TrendingDown}
              label={t.totalExpenses}
              value={money(detail.expenses)}
              tone="text-destructive"
            />
            <Figure
              icon={Wallet}
              label={detail.net >= 0 ? t.netProfit : t.netLoss}
              value={money(Math.abs(detail.net))}
              tone={detail.net >= 0 ? "text-success" : "text-destructive"}
              strong
            />
          </div>

          {detail.movements.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              {t.noMovementsDay}
            </p>
          ) : (
            <ul className="scroll-quiet max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {detail.movements.map((mv) => {
                const s = kindStyle[mv.kind];
                const Icon = s.icon;
                const outgoing = mv.kind === "expense";
                return (
                  <li key={`${mv.kind}-${mv.id}`} className="flex items-center gap-3 px-3 py-2.5">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        outgoing ? "bg-destructive/10" : "bg-success/10"
                      )}
                    >
                      <Icon className={cn("size-4", s.tone)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{mv.label}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant={s.badge} className="px-1.5 py-0 text-[10px]">
                          {label[mv.kind]}
                        </Badge>
                        {mv.detail && <span className="truncate">{mv.detail}</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className={cn("font-bold", outgoing ? "text-destructive" : "text-success")}>
                        {outgoing ? "−" : "+"} {money(mv.amount)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{time(mv.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Figure({
  icon: Icon,
  label,
  value,
  tone,
  strong,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
  strong?: boolean;
}) {
  return (
    <div className={cn("rounded-lg px-3 py-2", strong ? "bg-muted/60" : "bg-muted/30")}>
      <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className={cn("mt-0.5 font-bold", tone)}>{value}</p>
    </div>
  );
}
