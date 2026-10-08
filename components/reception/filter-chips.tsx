"use client";

import { cn } from "@/lib/utils";

export type FilterChip<K extends string> = {
  key: K;
  label: string;
  count?: number;
  tone?: "default" | "success" | "warning" | "destructive";
};

const toneDot: Record<NonNullable<FilterChip<string>["tone"]>, string> = {
  default: "bg-muted-foreground/60",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

/** Horizontal set of toggle chips used to filter a list client-side. */
export function FilterChips<K extends string>({
  chips,
  value,
  onChange,
  className,
}: {
  chips: FilterChip<K>[];
  value: K;
  onChange: (k: K) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((c) => {
        const active = c.key === value;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c.key)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              active
                ? "border-brand bg-brand/12 text-brand"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {c.tone && <span className={cn("size-1.5 rounded-full", toneDot[c.tone])} />}
            {c.label}
            {c.count != null && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-brand/20" : "bg-muted"
                )}
              >
                {c.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
