"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageInfo } from "@/lib/pagination";
import type { Locale } from "@/lib/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/**
 * Page navigator driven by the `page` query parameter. Keeps every other
 * parameter (search, filters, month) intact. Hidden when there is one page.
 */
export function Pagination({
  info,
  locale,
  labels,
  className,
}: {
  info: PageInfo;
  locale: Locale;
  labels: { showing: string; of: string; prev: string; next: string; first: string; last: string };
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rtl = locale === "ar";
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  const First = rtl ? ChevronsRight : ChevronsLeft;
  const Last = rtl ? ChevronsLeft : ChevronsRight;
  const n = (v: number) => formatNumber(v, locale);

  if (info.pageCount <= 1) return null;

  function go(page: number) {
    const p = new URLSearchParams(params.toString());
    if (page <= 1) p.delete("page");
    else p.set("page", String(page));
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // A compact window of page numbers around the current one.
  const window: number[] = [];
  for (let i = Math.max(1, info.page - 2); i <= Math.min(info.pageCount, info.page + 2); i++) {
    window.push(i);
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 sm:flex-row",
        className
      )}
    >
      <p className="text-xs text-muted-foreground">
        {labels.showing} {n(info.from)}–{n(info.to)} {labels.of} {n(info.total)}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" title={labels.first} disabled={info.page === 1} onClick={() => go(1)}>
          <First />
        </Button>
        <Button variant="outline" size="icon-sm" title={labels.prev} disabled={info.page === 1} onClick={() => go(info.page - 1)}>
          <Prev />
        </Button>
        {window.map((p) => (
          <Button
            key={p}
            variant={p === info.page ? "brand" : "ghost"}
            size="icon-sm"
            onClick={() => go(p)}
            aria-current={p === info.page ? "page" : undefined}
            className="tabular-nums"
          >
            {n(p)}
          </Button>
        ))}
        <Button variant="outline" size="icon-sm" title={labels.next} disabled={info.page === info.pageCount} onClick={() => go(info.page + 1)}>
          <Next />
        </Button>
        <Button variant="outline" size="icon-sm" title={labels.last} disabled={info.page === info.pageCount} onClick={() => go(info.pageCount)}>
          <Last />
        </Button>
      </div>
    </div>
  );
}
