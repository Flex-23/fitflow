"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { shiftMonth, safeMonth } from "@/lib/gym-day";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Month navigator driven by the `month` query parameter. Arrows follow the
 * reading direction, so in Arabic "previous" points right.
 */
export function MonthPicker({
  value,
  locale,
  labels,
  className,
}: {
  value: string;
  locale: Locale;
  labels: { prev: string; next: string; current: string };
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rtl = locale === "ar";
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;

  const thisMonth = safeMonth(undefined);
  const isCurrent = value === thisMonth;

  function go(month: string) {
    const p = new URLSearchParams(params.toString());
    p.set("month", month);
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Button
        variant="outline"
        size="icon-sm"
        title={labels.prev}
        aria-label={labels.prev}
        onClick={() => go(shiftMonth(value, -1))}
      >
        <Prev />
      </Button>

      <Input
        type="month"
        value={value}
        onChange={(e) => e.target.value && go(e.target.value)}
        dir="ltr"
        className="h-9 w-40 text-center"
      />

      <Button
        variant="outline"
        size="icon-sm"
        title={labels.next}
        aria-label={labels.next}
        disabled={isCurrent}
        onClick={() => go(shiftMonth(value, 1))}
      >
        <Next />
      </Button>

      {!isCurrent && (
        <Button variant="soft-brand" size="xs" onClick={() => go(thisMonth)}>
          <CalendarDays />
          {labels.current}
        </Button>
      )}
    </div>
  );
}
