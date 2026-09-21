"use client";

import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50",
        // justify follows text direction, so the knob mirrors correctly in RTL
        checked ? "justify-end bg-brand" : "justify-start bg-muted",
        className
      )}
    >
      <span className="size-5 rounded-full bg-white shadow transition-transform" />
    </button>
  );
}
