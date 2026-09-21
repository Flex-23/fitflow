"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Digits only — IQD has no fractional unit in daily use. */
export function toRawDigits(v: string | number | null | undefined): string {
  if (v == null) return "";
  return String(v).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** "1500000" → "1,500,000". Western digits and commas regardless of locale. */
export function groupDigits(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Amount field with live thousands separators.
 *
 * The visible box shows "1,500,000"; a hidden input posts the bare "1500000"
 * under `name`, so server schemas keep using `z.coerce.number()` unchanged.
 * Works controlled (`value` + `onValueChange`) or uncontrolled (`defaultValue`).
 */
export function MoneyInput({
  name,
  id,
  value,
  defaultValue,
  onValueChange,
  max,
  min = 0,
  required,
  placeholder = "0",
  className,
  autoFocus,
  disabled,
  suffix,
}: {
  name: string;
  id?: string;
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (raw: string) => void;
  max?: number;
  min?: number;
  required?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Currency label rendered inside the field, e.g. "د.ع". */
  suffix?: string;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(() => toRawDigits(defaultValue));
  const raw = controlled ? toRawDigits(value) : inner;
  const display = groupDigits(raw);

  const inputRef = useRef<HTMLInputElement>(null);
  // Digits to the left of the caret at the moment of the edit; restored after
  // React re-renders the grouped value so the caret does not jump to the end.
  const caretDigits = useRef<number | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    const want = caretDigits.current;
    if (!el || want === null || document.activeElement !== el) return;
    let seen = 0;
    let pos = display.length;
    for (let i = 0; i < display.length; i++) {
      if (/\d/.test(display[i]!)) seen++;
      if (seen === want) {
        pos = i + 1;
        break;
      }
    }
    if (want === 0) pos = 0;
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  }, [display]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    caretDigits.current = before.replace(/\D/g, "").length;

    let next = toRawDigits(el.value);
    if (max !== undefined && next && Number(next) > max) next = String(max);
    if (!controlled) setInner(next);
    onValueChange?.(next);
  }

  // `min` is enforced by the server schemas; the hidden input carries the raw
  // value so `required` on the visible box is the only client-side rule.
  void min;

  return (
    <div className="relative">
      <input type="hidden" name={name} value={raw} />
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        dir="ltr"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-start text-sm font-semibold tabular-nums shadow-sm transition-colors",
          "placeholder:font-normal placeholder:text-muted-foreground",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          suffix && "pe-12",
          className
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
