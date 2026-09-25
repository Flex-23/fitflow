"use client";

import { useState } from "react";
import { RotateCw, CalendarX2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import type { PageInfo } from "@/lib/pagination";
import { RenewForm } from "@/components/reception/renew-form";
import type { PlanOption } from "@/components/reception/plan-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, daysUntil } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

export type ExpiredRow = {
  subscriptionId: string;
  memberId: string;
  memberName: string;
  phone: string;
  planName: string;
  startDate: string;
  endDate: string;
};

export function ExpiredSubscriptions({
  rows,
  plans,
  paging,
  dict,
  locale,
}: {
  rows: ExpiredRow[];
  plans: PlanOption[];
  paging: PageInfo;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.reception;
  const [selected, setSelected] = useState<ExpiredRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder={t.searchMembers} />
        <Badge variant="destructive" className="h-8 px-3 text-xs">
          <CalendarX2 className="size-3.5" />
          {paging.total} {t.subscriptionsCount}
        </Badge>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarX2} title={t.noExpired} description={t.noExpiredDesc} />
      ) : (
        <Card>
          <Table className="min-w-[48rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead justify="center" className="w-[5%]">#</TableHead>
                <TableHead className="w-[24%]">{t.member}</TableHead>
                <TableHead className="w-[16%]">{t.selectPlan}</TableHead>
                <TableHead justify="center" className="w-[24%]">{t.period}</TableHead>
                <TableHead justify="center" className="w-[16%]">{t.expiredOn}</TableHead>
                <TableHead justify="end" className="w-[15%]">{dict.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const ago = Math.abs(Math.min(0, daysUntil(r.endDate)));
                return (
                  <TableRow key={r.subscriptionId}>
                    <TableCell justify="center" className="text-xs font-semibold text-muted-foreground">
                      {paging.from + i}
                    </TableCell>
                    <TableCell>
                      <div className="truncate font-medium">{r.memberName}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" />
                        <span dir="ltr" className="tabular-nums">{r.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell className="truncate font-medium">{r.planName}</TableCell>
                    <TableCell justify="center" className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                      <span dir="ltr">
                        {formatDate(r.startDate, locale)} → {formatDate(r.endDate, locale)}
                      </span>
                    </TableCell>
                    <TableCell justify="center">
                      <Badge variant="destructive" className="px-2.5 py-1 text-xs font-semibold">
                        {t.daysAgo.replace("{n}", String(ago))}
                      </Badge>
                    </TableCell>
                    <TableCell justify="end">
                      <Button variant="soft-brand" size="xs" onClick={() => setSelected(r)}>
                        <RotateCw />
                        {t.renew}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination info={paging} locale={locale} labels={dict.common.pager} />

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={t.renewTitle}
        description={t.renewDesc}
        className="max-w-lg"
      >
        {selected && (
          <RenewForm
            key={selected.subscriptionId}
            target={{
              memberId: selected.memberId,
              memberName: selected.memberName,
              phone: selected.phone,
              currentPlanName: selected.planName,
              currentEndDate: selected.endDate,
            }}
            plans={plans}
            dict={dict}
            locale={locale}
            onDone={() => setSelected(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
