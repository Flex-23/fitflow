"use client";

import { CalendarDays, Check } from "lucide-react";
import { formatMoney } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type PlanOption = {
  id: string;
  name: string;
  price: number;
  durationDays: number;
};

/**
 * Plan selection as a grid of radio-style cards. Emits the chosen id through
 * a hidden input so it posts with the surrounding form.
 */
export function PlanPicker({
  plans,
  value,
  onChange,
  dict,
  locale,
  name = "planId",
  compact = false,
}: {
  plans: PlanOption[];
  value: string;
  onChange: (id: string) => void;
  dict: Dictionary;
  locale: Locale;
  name?: string;
  compact?: boolean;
}) {
  const money = (n: number) => formatMoney(n, locale, dict.common.currency);

  return (
    <div role="radiogroup" className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3")}>
      <input type="hidden" name={name} value={value} />
      {plans.map((p) => {
        const selected = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(p.id)}
            className={cn(
              "group relative flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-brand bg-brand/10 shadow-[0_0_0_1px_var(--brand)]"
                : "border-border bg-background hover:border-brand/40 hover:bg-accent/40"
            )}
          >
            <span
              className={cn(
                "absolute end-2.5 top-2.5 grid size-5 place-items-center rounded-full border transition-colors",
                selected
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-background text-transparent group-hover:border-brand/50"
              )}
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className={cn("pe-6 font-semibold leading-tight", compact ? "text-sm" : "")}>
              {p.name}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {p.durationDays} {dict.common.days}
            </span>
            <span className={cn("mt-1 font-bold text-brand", compact ? "text-sm" : "text-base")}>
              {money(p.price)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
