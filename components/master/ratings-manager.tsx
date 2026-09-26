"use client";

import { Star, MessageSquareText, ListChecks, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { StatTile } from "@/components/manager/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PageInfo } from "@/lib/pagination";
import { formatDateTime } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type RatingRow = {
  id: string;
  memberName: string;
  memberPhone: string;
  exerciseName: string;
  stars: number;
  note: string | null;
  createdAt: string;
};

/** Five small stars, filled up to the given count — read-only, for display. */
function Stars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("size-3.5", n <= count ? "fill-brand text-brand" : "text-muted-foreground")}
        />
      ))}
    </div>
  );
}

export function RatingsManager({
  rows,
  totals,
  paging,
  dict,
  locale,
}: {
  rows: RatingRow[];
  /** Across every rating that matches the current search, not only this page. */
  totals: { count: number; average: number; withNotes: number };
  paging: PageInfo;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.ratings;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={ListChecks} label={t.totalRatings} value={String(totals.count)} tone="brand" />
        <StatTile
          icon={Star}
          label={t.average}
          value={totals.count ? totals.average.toFixed(1) : "—"}
          tone="warning"
        />
        <StatTile
          icon={MessageSquareText}
          label={t.withNotes}
          value={String(totals.withNotes)}
          tone="success"
        />
      </div>

      <SearchInput placeholder={t.searchPlaceholder} />

      {rows.length === 0 ? (
        <EmptyState icon={Star} title={t.noRatings} description={t.noRatingsDesc} />
      ) : (
        <Card>
          <Table className="min-w-[52rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead justify="center" className="w-[5%]">#</TableHead>
                <TableHead className="w-[18%]">{dict.manager.displayName}</TableHead>
                <TableHead className="w-[16%]">{dict.captain.exerciseName}</TableHead>
                <TableHead justify="center" className="w-[12%]">{t.average}</TableHead>
                <TableHead className="w-[37%]">{dict.common.notes}</TableHead>
                <TableHead justify="center" className="w-[12%]">{dict.manager.when}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id} className="[&>td]:align-top">
                  <TableCell justify="center" className="text-xs font-semibold text-muted-foreground">
                    {paging.from + i}
                  </TableCell>
                  <TableCell>
                    <div className="truncate font-medium">{r.memberName}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="size-3" />
                      <span dir="ltr" className="tabular-nums">
                        {r.memberPhone}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="truncate">{r.exerciseName}</TableCell>
                  <TableCell justify="center">
                    <Stars count={r.stars} />
                  </TableCell>
                  <TableCell
                    className={cn("text-sm", !r.note && "text-muted-foreground")}
                    dir="auto"
                  >
                    {r.note || t.noNote}
                  </TableCell>
                  <TableCell justify="center" className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(r.createdAt, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination info={paging} locale={locale} labels={dict.common.pager} />
    </div>
  );
}
