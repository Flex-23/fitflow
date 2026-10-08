"use client";

import { Banknote, Clock } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type PaymentMethod = "CASH" | "DEFERRED";

/** Two-option segmented control for cash vs deferred. Posts via hidden input. */
export function PaymentMethodToggle({
  value,
  onChange,
  dict,
  name = "method",
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  dict: Dictionary;
  name?: string;
}) {
  const options: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { key: "CASH", label: dict.method.cash, icon: <Banknote className="size-4" /> },
    { key: "DEFERRED", label: dict.method.deferred, icon: <Clock className="size-4" /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1">
      <input type="hidden" name={name} value={value} />
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              active
                ? "bg-card text-brand shadow-sm ring-1 ring-brand/40"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
