"use client";

import { IdCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Access-card field fed by the desk reader.
 *
 * The USB reader behaves like a keyboard: it types the digits, then presses
 * Enter. Inside a form Enter would submit it half-filled, so the key is
 * swallowed here and focus moves to the next field instead — the receptionist
 * taps the card and keeps typing.
 */
export function CardNumberInput({
  id = "cardNumber",
  defaultValue,
  placeholder,
  className,
}: {
  id?: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className="relative">
      <IdCard className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        name="cardNumber"
        defaultValue={defaultValue ?? ""}
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        placeholder={placeholder}
        className={cn("ps-10 text-start tabular-nums", className)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const form = e.currentTarget.form;
          if (!form) return;
          const fields = Array.from(
            form.querySelectorAll<HTMLElement>("input, select, textarea, button[type=submit]")
          ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
          const next = fields[fields.indexOf(e.currentTarget) + 1];
          next?.focus();
        }}
      />
    </div>
  );
}
