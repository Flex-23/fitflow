"use client";

import { Mars, Venus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FEMALE_MEASUREMENTS } from "@/schemas/member";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type Gender = "MALE" | "FEMALE";

/** Two-option segmented control for gender. Posts via hidden input. */
export function GenderToggle({
  value,
  onChange,
  dict,
  name = "gender",
}: {
  value: Gender | "";
  onChange: (g: Gender) => void;
  dict: Dictionary;
  name?: string;
}) {
  const options: { key: Gender; label: string; icon: React.ReactNode }[] = [
    { key: "MALE", label: dict.reception.male, icon: <Mars className="size-4" /> },
    { key: "FEMALE", label: dict.reception.female, icon: <Venus className="size-4" /> },
  ];

  return (
    <div className="grid h-10 grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1">
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
              "flex items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-all",
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

export type Measurements = Partial<Record<(typeof FEMALE_MEASUREMENTS)[number], number | null>>;

/**
 * Chest / waist / hips / glutes / arm inputs. Rendered only for female
 * members; every field is required when shown.
 */
export function FemaleMeasurementFields({
  dict,
  defaults,
  errors,
  className,
}: {
  dict: Dictionary;
  defaults?: Measurements;
  errors?: Record<string, string[] | undefined>;
  className?: string;
}) {
  const t = dict.reception;
  const labels: Record<(typeof FEMALE_MEASUREMENTS)[number], string> = {
    chest: t.chest,
    waist: t.waist,
    hips: t.hips,
    glutes: t.glutes,
    arm: t.arm,
  };

  return (
    <div className={cn("rounded-xl border border-brand/20 bg-brand/5 p-4", className)}>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Venus className="size-4 text-brand" />
        {t.extraMeasurements}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FEMALE_MEASUREMENTS.map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>{labels[key]}</Label>
            <Input
              id={key}
              name={key}
              type="number"
              step="0.1"
              min={1}
              inputMode="decimal"
              required
              defaultValue={defaults?.[key] ?? ""}
              dir="ltr"
              className="text-start"
            />
            {errors?.[key] && <p className="text-xs text-destructive">{t.invalidField}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
